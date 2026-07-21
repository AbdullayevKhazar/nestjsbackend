import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),

  PORT: Joi.number().default(5000),

  API_PREFIX: Joi.string().default('api/v1'),

  APP_NAME: Joi.string().required(),

  MONGODB_URI: Joi.string().required(),

  JWT_SECRET: Joi.string().required(),

  JWT_EXPIRES_IN: Joi.string().required(),

  JWT_REFRESH_SECRET: Joi.string().required(),

  ENCRYPTION_KEY: Joi.string().min(8).required(),

  ENCRYPTION_KEY_VERSION: Joi.string().default('1'),

  WEBAUTHN_RP_NAME: Joi.string().optional(),
  WEBAUTHN_RP_ID: Joi.string().optional(),
  WEBAUTHN_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional(),

  FRONTEND_URL: Joi.alternatives().conditional('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required(),
    otherwise: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .optional(),
  }),
}).unknown();
