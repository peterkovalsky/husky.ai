Restructure the system in the following way:
- when user submits a prompt we create a build. The build is the main entrypoint and source of truth for user request. A build tracks progress and links to other tables.
- Add a new column called "user_prompt" to the builds table. When user submits a prompt, create a build record with this user prompt, status QUEUED, project_id. Use build_id when queuing a message for sqs insterad of prompt_id, project_id and default version 0. 
- Remove input_tokens and output_tokens from the builds table.