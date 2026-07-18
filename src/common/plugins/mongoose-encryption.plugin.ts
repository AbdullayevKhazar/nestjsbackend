import { Schema, Document } from 'mongoose';
import { EncryptionPluginOptions } from '../interfaces/encryption-options.interface';

/**
 * Production-grade Mongoose plugin for transparent field-level encryption.
 *
 * Encrypts specified fields before saving to MongoDB and decrypts them
 * automatically when documents are loaded into the application layer.
 *
 * Hooks covered:
 * - save / create
 * - init (document hydration from DB)
 * - find / findOne / findOneAndUpdate (post-hooks)
 * - updateOne / updateMany (pre-hooks encrypt the payload)
 * - insertMany
 * - aggregate (post-hooks — best-effort for $project shapes)
 *
 * Important: $inc, $mul, and other arithmetic operators in update payloads
 * CANNOT be used with encrypted fields because the DB cannot compute on
 * ciphertext.  Business logic must read → decrypt → modify → save instead.
 */
export function applyEncryptionPlugin(
  schema: Schema,
  options: EncryptionPluginOptions,
): void {
  const { fields, encrypt, decrypt, isEncrypted } = options;

  // eslint-disable-next-line no-console
  console.log(
    `[DEBUG-PLUGIN] applyEncryptionPlugin registered for schema "${schema.options?.collection || 'unknown'}". ` +
      `Fields: ${fields.join(', ')}`,
  );

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function encryptField(doc: any, field: string): void {
    const value = doc[field];
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-PLUGIN] encryptField() field="${field}" ` +
        `rawValue=${JSON.stringify(value)} type=${typeof value} ` +
        `isEncrypted=${isEncrypted(value)}`,
    );
    if (value !== undefined && value !== null && !isEncrypted(value)) {
      const encrypted = encrypt(value);
      doc[field] = encrypted;
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG-PLUGIN] encryptField() field="${field}" encrypted to ${encrypted?.substring(0, 30)}...`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG-PLUGIN] encryptField() field="${field}" SKIPPED ` +
          `(undefined=${value === undefined}, null=${value === null}, alreadyEncrypted=${isEncrypted(value)})`,
      );
    }
  }

  function decryptField(doc: any, field: string): void {
    const value = doc[field];
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-PLUGIN] decryptField() field="${field}" ` +
        `rawValue=${JSON.stringify(value)} type=${typeof value} ` +
        `isEncrypted=${isEncrypted(value)}`,
    );
    if (value !== undefined && value !== null && isEncrypted(value)) {
      try {
        const decrypted = decrypt(value);
        doc[field] = decrypted;
        // eslint-disable-next-line no-console
        console.log(
          `[DEBUG-PLUGIN] decryptField() field="${field}" decrypted to ${JSON.stringify(decrypted)}`,
        );
      } catch (err) {
        // If decryption fails, leave as-is (may be plaintext during migration)
        // eslint-disable-next-line no-console
        console.log(
          `[DEBUG-PLUGIN] decryptField() field="${field}" DECRYPTION FAILED: ${(err as Error).message}`,
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG-PLUGIN] decryptField() field="${field}" SKIPPED ` +
          `(undefined=${value === undefined}, null=${value === null}, isEncrypted=${isEncrypted(value)})`,
      );
    }
  }

  function encryptUpdatePayload(update: any): void {
    if (!update) return;

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-PLUGIN] encryptUpdatePayload() called. update keys=${Object.keys(update).join(', ')}`,
    );

    // Direct field updates: { balance: 5 }
    fields.forEach((field) => {
      if (update[field] !== undefined && !isEncrypted(update[field])) {
        update[field] = encrypt(update[field]);
        // eslint-disable-next-line no-console
        console.log(
          `[DEBUG-PLUGIN] encryptUpdatePayload() direct field "${field}" encrypted`,
        );
      }
    });

    // $set operator
    if (update.$set) {
      fields.forEach((field) => {
        if (
          update.$set[field] !== undefined &&
          !isEncrypted(update.$set[field])
        ) {
          update.$set[field] = encrypt(update.$set[field]);
          // eslint-disable-next-line no-console
          console.log(
            `[DEBUG-PLUGIN] encryptUpdatePayload() $set field "${field}" encrypted`,
          );
        }
      });
    }

    // $setOnInsert operator
    if (update.$setOnInsert) {
      fields.forEach((field) => {
        if (
          update.$setOnInsert[field] !== undefined &&
          !isEncrypted(update.$setOnInsert[field])
        ) {
          update.$setOnInsert[field] = encrypt(update.$setOnInsert[field]);
          // eslint-disable-next-line no-console
          console.log(
            `[DEBUG-PLUGIN] encryptUpdatePayload() $setOnInsert field "${field}" encrypted`,
          );
        }
      });
    }
  }

  function decryptDocument(doc: any): void {
    if (!doc) return;
    fields.forEach((field) => decryptField(doc, field));
  }

  // -------------------------------------------------------------------------
  // Pre-hooks  — encrypt before DB sees the data
  // -------------------------------------------------------------------------

  schema.pre('save', function () {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('save') hook firing`);
    const doc = this as any;
    fields.forEach((field) => encryptField(doc, field));
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('save') hook complete`);
  });

  schema.pre('updateOne', function () {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('updateOne') hook firing`);
    const update = this.getUpdate() as any;
    encryptUpdatePayload(update);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('updateOne') hook complete`);
  });

  schema.pre('updateMany', function () {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('updateMany') hook firing`);
    const update = this.getUpdate() as any;
    encryptUpdatePayload(update);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('updateMany') hook complete`);
  });

  schema.pre('findOneAndUpdate', function () {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('findOneAndUpdate') hook firing`);
    const update = this.getUpdate() as any;
    encryptUpdatePayload(update);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] pre('findOneAndUpdate') hook complete`);
  });

  (schema as any).pre('insertMany', function (...args: any[]) {
    const docs = args.find((a) => Array.isArray(a));
    const next = args.find((a) => typeof a === 'function');

    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-PLUGIN] pre('insertMany') hook firing. docs.length=${docs?.length} ` +
        `nextType=${typeof next}`,
    );
    if (Array.isArray(docs)) {
      docs.forEach((doc: any, index: number) => {
        // eslint-disable-next-line no-console
        console.log(
          `[DEBUG-PLUGIN] pre('insertMany') processing doc[${index}]`,
        );
        fields.forEach((field) => encryptField(doc, field));
      });
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG-PLUGIN] pre('insertMany') WARNING: docs is not an array.`,
      );
    }
    if (typeof next === 'function') {
      next();
    }
  });

  // -------------------------------------------------------------------------
  // Post-hooks — decrypt after DB returns data
  // -------------------------------------------------------------------------

  schema.post('init', function (doc: any) {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('init') hook firing for doc._id=${doc?._id}`);
    decryptDocument(doc);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('init') hook complete`);
  });

  schema.post('find', function (docs: any[]) {
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-PLUGIN] post('find') hook firing. docs.length=${docs?.length}`,
    );
    if (Array.isArray(docs)) {
      docs.forEach((doc) => decryptDocument(doc));
    }
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('find') hook complete`);
  });

  schema.post('findOne', function (doc: any) {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('findOne') hook firing`);
    decryptDocument(doc);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('findOne') hook complete`);
  });

  schema.post('findOneAndUpdate', function (doc: any) {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('findOneAndUpdate') hook firing`);
    decryptDocument(doc);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('findOneAndUpdate') hook complete`);
  });

  schema.post('save', function (doc: any) {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('save') hook firing for doc._id=${doc?._id}`);
    decryptDocument(doc);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('save') hook complete`);
  });

  schema.post('updateOne', function () {
    // updateOne does not return the document by default,
    // but if { new: true } or similar is used via findOneAndUpdate,
    // the findOneAndUpdate hook above handles it.
  });

  schema.post('aggregate', function (results: any[]) {
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG-PLUGIN] post('aggregate') hook firing. results.length=${results?.length}`,
    );
    if (!Array.isArray(results)) return;
    results.forEach((doc) => decryptDocument(doc));
    // eslint-disable-next-line no-console
    console.log(`[DEBUG-PLUGIN] post('aggregate') hook complete`);
  });
}
