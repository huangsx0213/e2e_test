# Variable System Guide

## 1. Core Concepts
The system supports multi-level variable management to ensure variables can be correctly isolated, shared, and persisted across complex test Scenarios, Suites, and Cases.

## 2. Variable Scopes
Variables can be stored in four different scopes, prioritized from highest to lowest:
1.  **CASE**: Valid only within the current test case. Cleared after execution.
2.  **SUITE**: Shared across all test cases within the same suite.
3.  **SCENARIO**: Shared across all suites within a scenario run.
4.  **ENVIRONMENT**: Global variables defined in environment settings.

## 3. Auto-Namespacing
To prevent conflicts between different test cases or suites, the system automatically prefixes runtime variables:
*   **Case-level variables**: Automatically prefixed with `case_name.` (e.g., `login.token`).
*   **Suite-level variables**: Automatically prefixed with `suite_name.`.
*   **Scenario-level variables**: Automatically prefixed with `scenario_name.`.

**Note**: You can still access variables by their original name, but prefixes allow explicit referencing of specific sources.

## 4. Module Namespacing (RUN_MODULE)
When using the `RUN_MODULE` step to call a module, you can specify a **Namespace** (export alias):
*   **Function**: All basic variables extracted within the module will automatically have this namespace prefix when returned to the parent context.
*   **Example**: Calling a module with Namespace `buyer` will turn an internal `userId` variable into `buyer.userId`.
*   **Purpose**: Solves variable collision issues when the same module is called multiple times in a single scenario.

## 5. Data Lifecycle Management (DLM)
Evaluation strategies define the **Cache Persistence Level** of a dynamic expression. This ensures data consistency across different architectural boundaries of your test execution.

| Strategy | Cache Lifecycle | Best Use Case |
| :--- | :--- | :--- |
| **Every Time** | None (Real-time) | OTPs, unique nonces, dynamic timestamps. |
| **Once Per Case** | Current Case execution | Sharing a random name between input and validation steps. |
| **Once Per Suite** | Current Suite execution | Batch IDs shared across all tests in an "Order Suite". |
| **Once Per Scenario** | Current Scenario execution | A "New User ID" created in Signup and used in Checkout. |
| **Once Per Run** | Global Task execution | Execution UUIDs, environment-wide session tokens. |

## 6. Pipe Assignment & Hybrid Extraction
You can persist dynamic values or API responses directly as variables:
*   **Pipe Assignment**: `{{$generator() | set('var_name', 'scope')}}`.
*   **Hybrid Extraction (Smart Wait)**: Enable "Wait for API Response" in UI steps to add API extractors that capture data from background network traffic.
*   **Default Scope**: Both `set` pipe and Smart Wait extractors default to the **`CASE`** scope.
*   **Example**: `{{$timestamp() | set('order_time')}}` generates a timestamp and stores it in the current Case's `order_time` variable.

## 7. Best Practices
1.  **Prefer CASE Scope**: Unless a variable truly needs to be shared across multiple test cases, always use the `CASE` scope to keep the context clean.
2.  **Use Module Namespaces**: Set a clear Namespace for `RUN_MODULE` steps in complex flows to ensure robustness and readability.
3.  **Freeze Random Values**: If a random ID needs to be used across multiple steps (e.g., Create -> Query), use the 'Once Per Run' strategy or the 'set' pipe to freeze it.
