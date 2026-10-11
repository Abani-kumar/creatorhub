# AI Usage

AI tools were used to assist with development, testing, debugging, and technical documentation. All generated code and recommendations were subject to review and validation.

## 1. Which AI tools did you use?

- **Claude:** Repository analysis, implementation, testing, and documentation.
- **ChatGPT:** Architecture discussions, design decisions, debugging analysis, and reviewing business rules.

## 2. What did you use them for?

AI assisted with auditing the existing codebase, implementing the content form and verification workflow, improving API validation, writing tests, and preparing the architecture and cost-estimation documents.

ChatGPT was also used to evaluate trade-offs around authentication, publishing restrictions, upload simulation, and thumbnail persistence.

## 3. Where did AI save you the most time?

AI saved time on repetitive implementation work, test creation, debugging, and documentation. It also helped evaluate alternative approaches before committing to an implementation.

Reviewing generated code, investigating unexpected behavior, and validating assumptions still required engineering effort.

## 4. Give one example of something AI produced that you corrected.

The initial infrastructure cost model omitted a storage-transfer cost in one proposed architecture. Reviewing the design against the pricing assumptions exposed the omission. The missing cost was added, and the calculations were updated.

This reinforced the importance of checking generated calculations and technical assumptions rather than accepting them at face value.

## 5. How did you verify AI-generated code?

Verification included TypeScript checks, automated tests with Vitest, production builds, and browser-based testing of key workflows. Particular attention was given to publishing restrictions, creator data isolation, verification transitions, error handling, and persistence.

The final results and test counts should reflect the checks actually run against the submitted version.

## 6. What did you deliberately choose to do yourself?

I retained responsibility for evaluating architectural trade-offs, prioritizing requirements, deciding which functionality should be simulated, and reviewing the final implementation.

The objective was to use AI to accelerate development while maintaining control over correctness, scope, and engineering decisions.


