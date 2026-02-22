const Joi = require('joi');

const configSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required()
    .messages({
      'any.required': 'Nome é obrigatório',
      'string.empty': 'Nome não pode estar vazio',
      'string.min': 'Nome deve ter pelo menos 1 caractere',
      'string.max': 'Nome não pode ter mais de 100 caracteres',
    }),

  systemPrompt: Joi.string().max(5000).allow('').default('')
    .messages({
      'string.max': 'Prompt não pode ter mais de 5000 caracteres',
    }),

  model: Joi.string().empty('').valid(
    'gpt-3.5-turbo',
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'grok-2',
    'grok-2-mini',
    'grok-3-mini'
  ).default('gpt-4o-mini')
    .messages({
      'any.only': 'Modelo inválido. Modelos suportados: gpt-4o, gpt-4o-mini, grok-3-mini',
    }),

  temperature: Joi.number().min(0).max(2).default(0.7),
  maxTokens: Joi.number().min(100).max(4000).default(2000),
  urls: Joi.array().items(Joi.string().uri()).max(10).default([]),
  additionalInfo: Joi.string().max(10000).allow('').default(''),
});

function validateConfig(req, res, next) {
  const { error, value } = configSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      error: 'Validação falhou',
      details: error.details.map(d => d.message),
    });
  }

  req.body = value;
  next();
}

module.exports = { validateConfig };
