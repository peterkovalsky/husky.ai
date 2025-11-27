For the first prompt we will have a dedicated page "/project/new" instead of having "project/:id" holding everything
When user clicks on "Create Project" we will redirect to this page. We no longer ask them to create a new project.
During prompt analysis we need to determine a short name for the project with AI and create the project. 
We need to check if the project with this name already exist in the workspace. If so, we just add date stanp at the end of project's name.
The new page will have the same befavour as the old one. After it finishes building it will redirect to project preview.
We need to introduce a new field "status" for every project:
 - NEW: newly created project without any build;
 - FAILED: contains only failed builds;
 - READY: containes at least one successfull build;
 On the dashboard we only show READY projects.
 Need to backfill exisinting projects with this property.
