USER FLOW

In the dropdown menu of a project card add new item Publish. This menu item is diasbled when there are no successful builds for the project. 
User click on the Publish menu item and a small popup appears. The popup will have a URL <project_subdomain>.huskystudio.io, last project updated date time, last published date/time, cancel button and Publish button.
User clicks on Publish button - this will initiate publishing on the backend. The Publish button shows a loading spinner. UI checks status endpoint for the publishing and once the status changes to PUBLISHED we show a green tick and update date last published.


GENERATE PROJECT SUBDOMAIN

Update "projects" table to have a new column "subdomain".

When project if created for the first time, we need to generate a subdomain for it:
- Autogenerate subdomain in a format ${adj}-${noun}-${num} following strict rules for domain names
- Check other projects to make sure it's a unique subdomain
- Save the generated name to subdomain filed for the project


NEW ENDPOINTS

Update "projects" table with published_status column and default value UNPUBLISHED. Also add nullable column "published_at"

We will have 2 new endpoints:
1. Initiate publishing for the project
    - validates permissions
    - validates if there is at least one successful build
    - puts a message on SQS queue for publishing

2. Status of the publishing
    - returns status of publishing of the given project
    - returns last published date if the status is PUBLISHED
    - possible values: UNPUBLISHED, PUBLISHING, PUBLISHED


PRODUCTION BUILD

At the end of each build stage, add one more step that builds production build. It will build the app similar to preview build but with the root base path ("/"). After the build is finished, upload production build to S3 bucket "<projects bucket>/<project_id>/web/v<version_number>/production-build". Rename the folder name for preview builds to "preview-build". Add extra metric to measure how much time it takes for the production build to build and upload.


PUBLISHING

When publishing is initiated for a project, the background handler will do the following:
1. Change publishing status to PUBLISHING 
2. Copy production build for the current project version from "<projects bucket>/<project_id>/web/v<version_number>/production-build" to "<publish_bucket>/<project_id>/web" S3 bucket
3. Create Cloudfront distribution for that publish bucket path with these settings:
    - Alternate Domain Names (CNAMEs): <subdomain>.huskystudio.ai
    - SSL Certificate: Request/use ACM certificate for *.huskystudio.ai
    - Default Root Object: index.html
    - Add custom error response for 404 → 200, pointing to /index.html
    - Disable caching
4. Update projects table to add cloudfront information
5. Check status of the distribution and when it's ready and <subdomain>.huskystudio.ai is up and running we mark publish status as PUBLISHED

REPUBLISHING

When user publishes a new version, we follow the standard PUBLISHING plan except for:
    - delete anything in "<publish_bucket>/<project_id>/web" and reupload a new production build
    - check if Cloudfront distribution is already created if not, create one
    - update published date in projects table