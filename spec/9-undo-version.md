As a user I want to undo my last version of the app.

## UI
Add an undo icon button in the header of the chat widget that will call undo endpoint.

After user clicks on the undo button ask them if they sure.

The endpoint will return a link to the previous version and we need to reload the iframe with.

We only show the undo button if user has at least 2 successful builds.

## Endpoint
Undo endpoint will find the latest successful version and delete it. 
Also delete the version from S3 storage.
Redeploy the previous successfull version to S3 preview
Add validation to make sure user has at least 2 successful builds before attempting to undo latest one.