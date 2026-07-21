import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';

import { Passkey, PasskeyDocument } from './schemas/passkey.schema';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserService } from '../../users/users.service';
import { CHALLENGE_TTL_MS } from './webauthn.constants';

interface ChallengeEntry {
  challenge: string;
  userId?: string;
  expiresAt: number;
}

@Injectable()
export class WebAuthnService {
  private readonly challenges = new Map<string, ChallengeEntry>();

  constructor(
    @InjectModel(Passkey.name)
    private readonly passkeyModel: Model<PasskeyDocument>,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  private get rpName(): string {
    return this.configService.getOrThrow<string>('WEBAUTHN_RP_NAME');
  }

  private get rpId(): string {
    return this.configService.getOrThrow<string>('WEBAUTHN_RP_ID');
  }

  private get origin(): string {
    return this.configService.getOrThrow<string>('WEBAUTHN_ORIGIN');
  }

  private extractChallenge(
    response: RegistrationResponseJSON | AuthenticationResponseJSON,
  ): string {
    try {
      const clientDataJSON = JSON.parse(
        Buffer.from(response.response.clientDataJSON, 'base64url').toString(
          'utf-8',
        ),
      );
      return clientDataJSON.challenge;
    } catch {
      throw new BadRequestException('Invalid clientDataJSON in response');
    }
  }

  private storeChallenge(challenge: string, userId?: string): void {
    this.challenges.set(challenge, {
      challenge,
      userId,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
    this.cleanupChallenges();
  }

  private consumeChallenge(challenge: string, userId?: string): void {
    const entry = this.challenges.get(challenge);
    if (!entry) {
      throw new BadRequestException('Challenge not found. Please request new options.');
    }
    if (Date.now() > entry.expiresAt) {
      this.challenges.delete(challenge);
      throw new BadRequestException('Challenge expired. Please request new options.');
    }
    if (userId && entry.userId && entry.userId !== userId) {
      throw new BadRequestException('Challenge mismatch');
    }
    this.challenges.delete(challenge);
  }

  private cleanupChallenges(): void {
    const now = Date.now();
    for (const [key, entry] of this.challenges) {
      if (now > entry.expiresAt) {
        this.challenges.delete(key);
      }
    }
  }

  async findByUser(userId: string): Promise<PasskeyDocument[]> {
    return this.passkeyModel.find({ userId: new Types.ObjectId(userId) }).select('-publicKey');
  }

  async deletePasskey(userId: string, passkeyId: string): Promise<void> {
    const result = await this.passkeyModel.deleteOne({
      _id: new Types.ObjectId(passkeyId),
      userId: new Types.ObjectId(userId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Passkey not found');
    }
  }

  async generateRegistrationOptions(
    user: UserDocument,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existingPasskeys = await this.passkeyModel.find({
      userId: new Types.ObjectId(user.id),
    });

    const excludeCredentials = existingPasskeys.map((pk) => ({
      id: pk.credentialId,
      type: 'public-key' as const,
      transports: pk.transports as AuthenticatorTransportFuture[],
    }));

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.fullName,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    this.storeChallenge(options.challenge, user.id);
    return options;
  }

  async verifyRegistration(
    user: UserDocument,
    response: RegistrationResponseJSON,
  ): Promise<PasskeyDocument> {
    const challenge = this.extractChallenge(response);
    this.consumeChallenge(challenge, user.id);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        requireUserVerification: false,
      });
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Registration verification failed');
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Registration verification failed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const existing = await this.passkeyModel.findOne({
      credentialId: credential.id,
    });
    if (existing) {
      throw new BadRequestException('Passkey already registered');
    }

    const publicKey = Buffer.from(credential.publicKey).toString('base64url');

    const passkey = await this.passkeyModel.create({
      userId: new Types.ObjectId(user.id),
      credentialId: credential.id,
      publicKey,
      counter: credential.counter,
      transports: credential.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });

    return passkey;
  }

  async generateAuthenticationOptions(
    email?: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    let allowCredentials:
      | { id: string; type: 'public-key'; transports: AuthenticatorTransportFuture[] }[]
      | undefined;

    if (email) {
      const user = await this.userService.findByEmail(email);
      if (user) {
        const passkeys = await this.passkeyModel.find({
          userId: user._id,
        });
        allowCredentials = passkeys.map((pk) => ({
          id: pk.credentialId,
          type: 'public-key' as const,
          transports: pk.transports as AuthenticatorTransportFuture[],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: allowCredentials?.length ? allowCredentials : undefined,
      userVerification: 'preferred',
    });

    this.storeChallenge(options.challenge);
    return options;
  }

  async verifyAuthentication(
    response: AuthenticationResponseJSON,
  ): Promise<{ user: UserDocument; passkey: PasskeyDocument }> {
    const passkey = await this.passkeyModel.findOne({
      credentialId: response.id,
    });

    if (!passkey) {
      throw new NotFoundException('Passkey not found for this credential');
    }

    const challenge = this.extractChallenge(response);
    this.consumeChallenge(challenge);

    const user = await this.userService.findById(
      passkey.userId.toString(),
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(
            Buffer.from(passkey.publicKey, 'base64url'),
          ),
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: false,
      });
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Authentication verification failed');
    }

    if (!verification.verified || !verification.authenticationInfo) {
      throw new BadRequestException('Authentication verification failed');
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    await passkey.save();

    return { user, passkey };
  }
}
