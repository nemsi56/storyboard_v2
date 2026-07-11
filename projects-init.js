'use strict';

document.getElementById('pm-new-project-btn').addEventListener('click', openNewProjectModal);
document.getElementById('pm-import-btn').addEventListener('click', () => document.getElementById('proj-import-input').click());
document.getElementById('proj-import-input').addEventListener('change', function() { importProjectJSON(this); });
document.getElementById('proj-new-cancel-btn').addEventListener('click', closeNewProject);
document.getElementById('proj-new-create-btn').addEventListener('click', confirmNewProject);
document.getElementById('proj-rename-cancel-btn').addEventListener('click', closeProjRename);
document.getElementById('proj-rename-save-btn').addEventListener('click', confirmProjRename);
document.getElementById('proj-del-cancel-btn').addEventListener('click', closeProjDel);
document.getElementById('proj-del-confirm-btn').addEventListener('click', confirmProjDel);
