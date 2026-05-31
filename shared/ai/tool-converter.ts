import type { ZodType } from 'zod';
import type { JsonSchema } from './tool.ts';

export function zodToJsonSchema(schema: ZodType): JsonSchema {
  try {
    const result = (schema as any).toJSONSchema();
    return cleanJsonSchema(result);
  } catch {
    return convertFallback(schema);
  }
}

function cleanJsonSchema(raw: any): JsonSchema {
  if (!raw || typeof raw !== 'object') return { type: 'object' };

  const { $schema, ...rest } = raw;
  const cleaned = rest as JsonSchema;

  if (cleaned.properties) {
    const props: Record<string, JsonSchema> = {};
    for (const [key, val] of Object.entries(cleaned.properties)) {
      props[key] = cleanJsonSchema(val);
    }
    cleaned.properties = props;
  }

  if (cleaned.items) {
    cleaned.items = cleanJsonSchema(cleaned.items);
  }

  if (cleaned.anyOf) {
    cleaned.anyOf = cleaned.anyOf.map(cleanJsonSchema);
  }

  if (cleaned.oneOf) {
    cleaned.oneOf = cleaned.oneOf.map(cleanJsonSchema);
  }

  if (cleaned.allOf) {
    cleaned.allOf = cleaned.allOf.map(cleanJsonSchema);
  }

  if (cleaned.additionalProperties && typeof cleaned.additionalProperties === 'object') {
    cleaned.additionalProperties = cleanJsonSchema(cleaned.additionalProperties);
  }

  return cleaned;
}

function convertFallback(zodSchema: ZodType): JsonSchema {
  const def = (zodSchema as any)._def ?? (zodSchema as any).def;
  const type = def?.type;

  switch (type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'bigint':
      return { type: 'integer' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'null':
      return { type: 'null' };
    case 'undefined':
      return { type: 'null' };
    case 'any':
    case 'unknown':
      return {};
    case 'void':
      return { type: 'null' };
    case 'never':
      return { not: {} };
    case 'nullable': {
      const inner = def.innerType;
      const base = inner ? convertFallback(inner) : { type: 'object' };
      return { anyOf: [base, { type: 'null' }] };
    }
    case 'optional': {
      const inner = def.innerType;
      return inner ? convertFallback(inner) : { type: 'object' };
    }
    case 'object': {
      const shape = def.shape ?? {};
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as ZodType;
        const fieldDef = (fieldSchema as any)._def ?? (fieldSchema as any).def;
        const fieldType = fieldDef?.type;
        const isOptional = fieldType === 'optional';

        if (isOptional) {
          const inner = fieldDef.innerType;
          properties[key] = inner ? convertFallback(inner) : { type: 'object' };
        } else {
          properties[key] = convertFallback(fieldSchema);
        }

        if (!isOptional) {
          required.push(key);
        }
      }

      const result: JsonSchema = { type: 'object', properties };
      if (required.length > 0) {
        result.required = required;
      }
      return result;
    }
    case 'array': {
      const elementType = def.element ? convertFallback(def.element) : { type: 'string' };
      return { type: 'array', items: elementType };
    }
    case 'enum': {
      const entries = def.entries ?? {};
      const values = Object.values(entries);
      return { type: 'string', enum: values };
    }
    case 'union':
    case 'discriminatedUnion': {
      const options = def.options ?? [];
      return { anyOf: options.map((opt: ZodType) => convertFallback(opt)) };
    }
    case 'intersection': {
      const left = def.left;
      const right = def.right;
      return { allOf: [convertFallback(left), convertFallback(right)] };
    }
    case 'tuple': {
      const items = def.items ?? [];
      return { type: 'array', items: { oneOf: items.map((item: ZodType) => convertFallback(item)) } };
    }
    case 'record': {
      const keyType = def.keyType;
      const valueType = def.valueType;
      const valueSchema = valueType ? convertFallback(valueType) : { type: 'string' };
      if (keyType && (keyType._def?.type === 'string' || keyType.type === 'string')) {
        return { type: 'object', additionalProperties: valueSchema };
      }
      return { type: 'object', additionalProperties: valueSchema };
    }
    case 'map': {
      return { type: 'object', additionalProperties: true };
    }
    case 'set': {
      const valueType = def.valueType;
      return { type: 'array', items: valueType ? convertFallback(valueType) : { type: 'string' }, uniqueItems: true };
    }
    case 'literal': {
      const values = def.values ?? [];
      if (values.length === 1) {
        const value = values[0];
        return { type: typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string', const: value };
      }
      return { enum: values };
    }
    case 'promise':
    case 'lazy':
    case 'catch':
    case 'default':
    case 'pipeline':
    case 'readonly':
    case 'branded':
    case 'nonoptional':
    case 'transform': {
      const inner = def.innerType ?? def.in ?? def.input ?? def.type;
      return inner ? convertFallback(inner) : { type: 'object' };
    }
    case 'success':
      return { type: 'boolean' };
    case 'nan':
      return { type: 'number' };
    case 'symbol':
      return { type: 'string' };
    case 'file':
      return { type: 'string', format: 'binary' };
    default:
      return { type: 'object', description: `[unknown zod type: ${type}]` };
  }
}
