# State Transition Testing

## Definition

State Transition Testing models the system as a finite state machine, where the system can be in different states and transitions between states are triggered by events. It tests both valid transitions (the "happy path" through states) and invalid transitions (events that should not be allowed in a given state).

## When to Use

- System has distinct states with defined transitions (e.g., order status: Draft → Submitted → Approved → Shipped)
- Workflow or lifecycle management (e.g., document approval, account lifecycle)
- Modes or phases (e.g., trial → active → suspended → closed)
- Event-driven behavior (e.g., button enables/disables based on current state)
- Any system where the response to an input depends on the current state
- Timeout or expiration logic (e.g., session expires after 30 min of inactivity)

## Steps

1. **Identify states** — List all possible states the system can be in
2. **Identify events/transitions** — List all events that can trigger state changes
3. **Create the state-transition table:**
   - Rows: current states
   - Columns: events
   - Cells: resulting state (or "invalid" if transition not allowed)
4. **Create the state-transition diagram** — Visual representation of states and transitions
5. **Derive test conditions:**
   - **0-switch coverage:** Test each valid transition (cover every arc)
   - **1-switch coverage:** Test pairs of consecutive transitions
   - **n-switch coverage:** Test sequences of n+1 consecutive transitions
6. **Test invalid transitions** — Attempt transitions that should be rejected
7. **Test boundary conditions** — What happens at state entry/exit

## Example

**System:** User account lifecycle

| Current State | Event | Next State |
|--------------|-------|------------|
| Unregistered | Sign up | Pending Verification |
| Pending Verification | Verify email | Active |
| Pending Verification | Expire (24h) | Unregistered |
| Active | Suspend | Suspended |
| Active | Delete | Deleted |
| Suspended | Reactivate | Active |
| Suspended | Delete | Deleted |
| Deleted | — | (terminal state) |

**Invalid transitions to test:**
- Unregistered → Suspend (cannot suspend non-existent account)
- Pending Verification → Delete (must verify first, or use different flow)
- Deleted → Reactivate (cannot reactivate deleted account)

## Common Mistakes

- Only testing valid transitions and ignoring invalid ones (invalid transitions often reveal bugs)
- Not testing the "no transition" case — what happens when an event fires but no transition is defined?
- Missing state entry/exit actions (e.g., email sent on entering "Active" state)
- Not considering superstates or nested states (e.g., "Active" may have sub-states)
- Forgetting timeout transitions (e.g., session expires, payment window closes)
- Not testing the initial state — can the system reach all states from the initial state?

## Tips for Test Design

- Start with 0-switch coverage (every transition at least once), then add 1-switch for critical paths
- Invalid transitions are high-value tests — they often find security and data integrity bugs
- Use the state diagram to identify unreachable states (potential requirements issues)
- Consider "sneak paths" — unexpected ways to reach a state that bypass normal transitions
- For complex systems, test the most critical business paths end-to-end through multiple states
- Remember that states can be implicit (e.g., "form is dirty" is a state even if not explicitly modeled)
