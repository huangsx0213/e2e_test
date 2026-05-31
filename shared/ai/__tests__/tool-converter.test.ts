import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '../tool-converter.ts';

describe('zodToJsonSchema', () => {
  it('converts string schema', () => {
    const schema = z.object({ name: z.string() });
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe('object');
    expect(result.properties).toHaveProperty('name');
    expect(result.properties!.name).toEqual({ type: 'string' });
    expect(result.required).toContain('name');
  });

  it('converts number schema', () => {
    const schema = z.object({ age: z.number() });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.age).toEqual({ type: 'number' });
  });

  it('converts boolean schema', () => {
    const schema = z.object({ active: z.boolean() });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.active).toEqual({ type: 'boolean' });
  });

  it('converts enum schema', () => {
    const schema = z.object({ status: z.enum(['active', 'inactive']) });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.status).toEqual({ type: 'string', enum: ['active', 'inactive'] });
  });

  it('converts array schema', () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.tags).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('converts nested object schema', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number(),
      }),
    });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.user.type).toBe('object');
    expect(result.properties!.user.properties).toHaveProperty('name');
    expect(result.properties!.user.properties).toHaveProperty('age');
    expect(result.properties!.user.required).toContain('name');
    expect(result.properties!.user.required).toContain('age');
  });

  it('marks optional fields as not required', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.required).toContain('required');
    expect(result.required).not.toContain('optional');
    expect(result.properties).toHaveProperty('optional');
  });

  it('converts nullable field', () => {
    const schema = z.object({ name: z.string().nullable() });
    const result = zodToJsonSchema(schema);
    const nameSchema = result.properties!.name;
    expect(nameSchema.anyOf).toBeDefined();
    expect(nameSchema.anyOf).toHaveLength(2);
  });

  it('converts union schema', () => {
    const schema = z.object({ value: z.union([z.string(), z.number()]) });
    const result = zodToJsonSchema(schema);
    const valueSchema = result.properties!.value;
    expect(valueSchema.anyOf).toBeDefined();
    expect(valueSchema.anyOf!.length).toBe(2);
  });

  it('converts literal schema', () => {
    const schema = z.object({ type: z.literal('user') });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.type.const).toBe('user');
  });

  it('converts record schema', () => {
    const schema = z.object({ metadata: z.record(z.string(), z.string()) });
    const result = zodToJsonSchema(schema);
    expect(result.properties!.metadata.type).toBe('object');
    expect(result.properties!.metadata.additionalProperties).toBeDefined();
  });

  it('returns object with properties for complex schema', () => {
    const schema = z.object({
      id: z.string(),
      count: z.number(),
      tags: z.array(z.string()),
      status: z.enum(['open', 'closed']),
    });
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe('object');
    expect(Object.keys(result.properties!)).toHaveLength(4);
    expect(result.required).toHaveLength(4);
  });
});
