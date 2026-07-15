Product Requirements Document (PRD): Unified Growth Engine
1. Executive Summary & Vision
The Unified Growth Engine is a decoupled, self-hosted infrastructure platform designed to serve as a standalone product management and experimentation suite.
The Vision: To provide Product Managers and Engineers with a single, unified platform where feature rollout, A/B testing, and telemetric event routing are inextricably linked to strategic frameworks. By natively integrating North Star Metric mapping and the TARS (Targeted, Adopted, Retained, Satisfied) funnel, this tool ensures that every feature deployed is automatically measured against its intended audience and its impact on the overarching business goals.
2. Target Personas
• The Product Manager: Needs a dashboard to define feature target cohorts, monitor the TARS funnel without writing SQL, and prove a feature's impact on the North Star metric.
• The Application Builder: Needs a high-performance, type-safe SDK to handle flag resolution and event tracking with zero network latency, keeping core application code clean.
• The Data/Platform Owner: Requires an auto-scaling, fault-tolerant infrastructure that routes clean data to downstream analytics and alerting tools without data loss.
3. Framework Integrations (Core Value Proposition)
Instead of just toggling features, the administrative UI and backend telemetry must be built explicitly around these two product frameworks.
3.1 The North Star Engine
The platform must allow teams to define a top-level North Star metric and its leading inputs. When a feature flag is created or an A/B test is run, the dashboard must report the feature's statistical impact on these specific inputs.
• Example Use Case: For a financial expense chatbot, the North Star might be "Total Monthly Expenses Categorized." The inputs are "Number of Receipts Uploaded" and "Number of Chat Interactions." When a PM tests a new "Quick-Upload UI," the engine automatically queries the telemetry stream to report if the treatment group increased those specific inputs.
3.2 The Automated TARS Funnel
Every feature flag managed in the system is automatically mapped to a TARS funnel in the reporting dashboard.
• Targeted: The denominator. Defined by the feature flag's routing rules (e.g., targeted to 100% of users, or just users in "Edomex").
• Adopted: Triggered by the SDK's initial telemetry event when a user first interacts with the gated feature.
• Retained: Calculated automatically by the event stream when a user triggers the adoption event again after a defined frequency window (e.g., returning to use the feature in Week 2).
• Satisfied: Handled via an explicit SDK method (triggerSatisfaction()) that can push a micro-survey (like a Customer Effort Score) into the UI after successful retention, logging the qualitative response directly to the event stream.
4. Product Requirements & Technical Strategy
Module A: The Strategic Control Panel (Admin UI)
The visual dashboard where PMs construct their experiments and view framework-aligned reports.
• Requirement A1 - TARS Configuration: When creating a feature flag, the PM must define the target segment (Targeted) and set the expected retention frequency (e.g., Daily, Weekly) to calibrate the automated Retained metric.
• Requirement A2 - North Star Alignment: PMs must be able to link a feature flag to a specific predefined "North Star Input" event, instructing the analytics engine to prioritize reporting on that event for this feature.
• Requirement A3 - Visual Funnel Reporting: The dashboard must generate real-time TARS funnel visualizations and A/B test significance scores using data aggregated from the downstream telemetry broker.
• Technical Strategy: Build this as a standalone Next.js admin application. UI components can lean into distinctive branding (e.g., skeuomorphic design elements for clear, tactile toggles) to differentiate it from standard, sterile SaaS dashboards.
Module B: The Evaluation & Telemetry Gateway
The high-performance API that client applications communicate with.
• Requirement B1 - Sub-Millisecond Flag Resolution: The gateway must serve feature flag configurations to requesting applications almost instantly.
• Requirement B2 - Unified Event Ingestion: A single endpoint (POST /v1/track) must accept all telemetry, including general page views, TARS adoption/retention events, and satisfaction survey results.
• Requirement B3 - Strict Schema Validation: The gateway must reject malformed events. Every event must include a projectId, userId, and featureId (if applicable) to ensure the TARS funnels remain accurate.
• Technical Strategy: Deploy on stateless, auto-scaling container infrastructure (like Google Cloud Run). Utilize a cache-aside architecture with Redis to ensure the database is never a bottleneck during synchronous flag lookups.
Module C: Asynchronous Data Routing (The Broker)
The underlying infrastructure that ensures zero data loss and decouples the application from analytics vendors.
• Requirement C1 - Fanout Architecture: Ingested events must be cloned and distributed to distinct processing queues (e.g., one queue for internal TARS aggregation, one for external Google Analytics, one for alerting).
• Requirement C2 - Fault Tolerance: If an external vendor API goes down, the routing infrastructure must queue the events and retry automatically without impacting the main application or losing North Star data.
• Technical Strategy: Utilize a serverless message broker (like Google Cloud Pub/Sub). Events from the Gateway are published to a central Topic, which fans out to specialized Subscriptions. Lightweight Cloud Functions act as consumers, pulling from subscriptions and formatting the data for final destinations.
Module D: The Universal Client SDK
The library dropped into the consuming projects.
• Requirement D1 - Seamless TARS Tracking: The SDK must provide simple methods like engine.trackAdoption('feature-key') which automatically appends user context and fires to the Gateway.
• Requirement D2 - Deterministic Experiment Bucketing: The SDK (or the Gateway) must use deterministic hashing on the user ID to assign A/B test variants, ensuring users see the exact same feature state across sessions without requiring database lookups.
• Requirement D3 - Satisfaction Hooks: The SDK should expose a method to trigger lightweight, native-feeling micro-surveys when a user hits the "Retained" threshold, closing the TARS loop.
5. Success Metrics for the Platform Itself
To evaluate if this Growth Engine is successful upon deployment, track:
1. Integration Speed: Time taken for a new project/developer to implement the SDK and fire their first North Star event.
2. Dashboard DAU: How frequently Product Managers log into the Admin UI to evaluate their TARS funnels vs. requesting SQL pulls from engineering.
3. System Latency: Maintaining a p99 flag evaluation latency of < 5ms under load.