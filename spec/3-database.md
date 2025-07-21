## Add Supabase database with these tables:

- workspaces
    - id
    - name
    - created_at
    - modified_at

- projects
    - id
    - name
    - workspace_id
    - created_at
    - modified_at

- prompts
    - id
    - prompt
    - status
    - project_id
    - user_id
    - created_at
    - modified_at

- file_trees
    - id
    - file_tree
    - project_id
    - created_at
    - modified_at

- previews
    - id
    - preview_url
    - project_id    
    - created_at
    - modified_at

When user signs up, create a default workspace named "Personal" and a default project "My project" for this workspace. Every prompt is saved in "chats" table. Every file tree is saved in "file_trees" table. Every prompt to AI should include the latest file tree for the project. Every prompt to AI should also include all the previous prompts in messages for the project. After uploading bundle to S3, save website url to "previews" table.

## Prompt endpoint
Excepts "project_id" and prompt. Checks if current user belongs to the workspace. 
Every time user submits a prompt, system creates adds a new record to "prompts" table. Then passes the "prompt_id" to the sqs message for the handler to process based on that id. Controller returns the "prompt_id" to the frontend so it poll based on it.

## Status endpoint
Excepts "prompt_id" to check database and return the status. Checks if current user belongs to the workspace. If the status is ready, return preview url from "previews" table.

## Prompt handler
Uses "prompt_id" from the queue message to get prompt and current file tree (if available). Updates progress status in the "prompts" table.