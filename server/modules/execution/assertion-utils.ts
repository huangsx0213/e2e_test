import { JSONPath } from 'jsonpath-plus';
import { StepAssertion, AssertionOperator } from '../../../shared/contracts/index.ts';

export interface AssertionResult {
  success: boolean;
  actualValue: string;
  expectedValue: string;
  message: string;
}

export function validateAssertion(
  assertion: StepAssertion,
  actualValue: any
): AssertionResult {
  const actualStr = typeof actualValue === 'object' ? JSON.stringify(actualValue) : String(actualValue);
  const expectedStr = assertion.expectedValue;
  
  let success = false;
  let operatorLabel = '';

  switch (assertion.operator) {
    case 'EQUALS':
      success = actualStr === expectedStr;
      operatorLabel = 'equal to';
      break;
    case 'NOT_EQUALS':
      success = actualStr !== expectedStr;
      operatorLabel = 'not equal to';
      break;
    case 'CONTAINS':
      success = actualStr.includes(expectedStr);
      operatorLabel = 'contain';
      break;
    case 'NOT_CONTAINS':
      success = !actualStr.includes(expectedStr);
      operatorLabel = 'not contain';
      break;
    case 'MATCHES':
      try {
        const regex = new RegExp(expectedStr);
        success = regex.test(actualStr);
        operatorLabel = 'match regex';
      } catch {
        success = false;
        operatorLabel = 'match regex (invalid regex)';
      }
      break;
    case 'GT':
      success = Number(actualStr) > Number(expectedStr);
      operatorLabel = 'be greater than';
      break;
    case 'LT':
      success = Number(actualStr) < Number(expectedStr);
      operatorLabel = 'be less than';
      break;
    default:
      success = false;
      operatorLabel = `unknown operator (${assertion.operator})`;
  }

  return {
    success,
    actualValue: actualStr,
    expectedValue: expectedStr,
    message: success 
      ? `Assertion passed: Value "${actualStr}" is ${operatorLabel} "${expectedStr}"`
      : `Assertion failed: Expected value to ${operatorLabel} "${expectedStr}", but got "${actualStr}"`
  };
}

export function processApiAssertions(
  assertions: StepAssertion[],
  response: { status: number; headers: Record<string, string>; body: string }
): AssertionResult[] {
  const results: AssertionResult[] = [];
  let parsedJsonBody: any = null;
  let jsonParsed = false;

  for (const assertion of assertions) {
    if (!assertion.enabled) continue;
    
    let actualValue: any = undefined;

    try {
      if (assertion.source === 'API_STATUS') {
        actualValue = response.status;
      } else if (assertion.source === 'API_HEADER' && assertion.expression) {
        const headerKey = assertion.expression.toLowerCase();
        const foundKey = Object.keys(response.headers).find(k => k.toLowerCase() === headerKey);
        actualValue = foundKey ? response.headers[foundKey] : undefined;
      } else if (assertion.source === 'API_BODY' && assertion.expression) {
        if (!jsonParsed) {
          try {
            parsedJsonBody = JSON.parse(response.body);
          } catch {
            // Not JSON
          }
          jsonParsed = true;
        }
        
        if (parsedJsonBody) {
          const pathResult = JSONPath({ path: assertion.expression, json: parsedJsonBody });
          if (pathResult && pathResult.length > 0) {
            actualValue = pathResult[0];
          }
        } else {
          // Fallback to regex if not JSON? Or just fail?
          // For now, let's assume JSONPath requires JSON.
        }
      }

      if (actualValue !== undefined) {
        results.push(validateAssertion(assertion, actualValue));
      } else {
        results.push({
          success: false,
          actualValue: 'undefined',
          expectedValue: assertion.expectedValue,
          message: `Assertion failed: Could not extract value for source ${assertion.source} with expression ${assertion.expression}`
        });
      }
    } catch (err) {
      results.push({
        success: false,
        actualValue: 'error',
        expectedValue: assertion.expectedValue,
        message: `Assertion error: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  return results;
}
