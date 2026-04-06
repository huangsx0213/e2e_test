import { JSONPath } from 'jsonpath-plus';
import { XMLParser } from 'fast-xml-parser';
import { StepAssertion } from '../../../shared/contracts';

export interface AssertionContext {
  body: string;
  headers: Record<string, string>;
  status: number;
}

export interface AssertionResult {
  passed: boolean;
  message: string;
  actualValue?: any;
  assertion: StepAssertion;
}

export function evaluateAssertions(context: AssertionContext, assertions: StepAssertion[]): AssertionResult[] {
  const results: AssertionResult[] = [];
  for (const assertion of assertions) {
    let actualValue: any;
    try {
      switch (assertion.source) {
        case 'API_STATUS':
          actualValue = context.status;
          break;
        case 'API_HEADER':
          if (!assertion.expression) {
            throw new Error(`Expression (header name) is required for API_HEADER source.`);
          }
          // Case-insensitive header lookup
          const headerKey = Object.keys(context.headers).find(
            k => k.toLowerCase() === assertion.expression!.toLowerCase()
          );
          actualValue = headerKey ? context.headers[headerKey] : undefined;
          break;
        case 'API_BODY_JSON':
          if (!assertion.expression) {
            throw new Error(`Expression (JSONPath) is required for API_BODY_JSON source.`);
          }
          try {
            const parsedBody = JSON.parse(context.body);
            const jsonPathResults = JSONPath({ path: assertion.expression, json: parsedBody });
            actualValue = jsonPathResults.length > 0 ? jsonPathResults[0] : undefined;
          } catch (e) {
            throw new Error(`Could not parse response body as JSON. ${e}`);
          }
          break;
        case 'API_BODY_XML':
          if (!assertion.expression) {
            throw new Error(`Expression (XPath-like) is required for API_BODY_XML source.`);
          }
          try {
            const parser = new XMLParser();
            const parsedXml = parser.parse(context.body);
            actualValue = assertion.expression.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : undefined, parsedXml);
          } catch (e) {
            throw new Error(`Could not parse response body as XML. ${e}`);
          }
          break;
        default:
          throw new Error(`Unknown source ${assertion.source}`);
      }

      // Evaluate operator
      const expected = assertion.expectedValue;
      const actualStr = actualValue !== undefined && actualValue !== null ? String(actualValue) : '';
      const expectedStr = expected !== undefined && expected !== null ? String(expected) : '';

      switch (assertion.operator) {
        case 'EQUALS':
          if (actualStr !== expectedStr) {
            throw new Error(`Expected '${expectedStr}', but got '${actualStr}'`);
          }
          break;
        case 'NOT_EQUALS':
          if (actualStr === expectedStr) {
            throw new Error(`Expected not to equal '${expectedStr}'`);
          }
          break;
        case 'CONTAINS':
          if (!actualStr.includes(expectedStr)) {
            throw new Error(`Expected '${actualStr}' to contain '${expectedStr}'`);
          }
          break;
        case 'NOT_CONTAINS':
          if (actualStr.includes(expectedStr)) {
            throw new Error(`Expected '${actualStr}' not to contain '${expectedStr}'`);
          }
          break;
        case 'EXISTS':
          if (actualValue === undefined || actualValue === null) {
            throw new Error(`Expected value to exist at expression '${assertion.expression}'`);
          }
          break;
        case 'NOT_EXISTS':
          if (actualValue !== undefined && actualValue !== null) {
            throw new Error(`Expected value not to exist at expression '${assertion.expression}', but found '${actualStr}'`);
          }
          break;
        case 'MATCHES_REGEX':
          if (!expected) {
            throw new Error(`Expected value (regex pattern) is required for MATCHES_REGEX.`);
          }
          const regex = new RegExp(expected);
          if (!regex.test(actualStr)) {
            throw new Error(`Expected '${actualStr}' to match regex '${expected}'`);
          }
          break;
        default:
          throw new Error(`Unknown operator ${assertion.operator}`);
      }

      results.push({ passed: true, message: 'Passed', actualValue, assertion });
    } catch (e: any) {
      results.push({ passed: false, message: e.message, actualValue, assertion });
    }
  }
  return results;
}
