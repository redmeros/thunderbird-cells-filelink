this is an thunderbird file link addon. this addon will be used internally in an organization to
support user workflows and improve productivity for sending large attachments throught email. The addon provides a simple interface to create and manage file links, allowing users to easily share large files without the need for traditional email attachments.

generally, filelink has special api in thunderbird that allows developers to create custom file link providers. This addon leverages that API to integrate seamlessly with Thunderbird, providing users with a streamlined experience for sending large files. We should use this to utilise best experience for thunderbird users.

documentation for filelink is at <https://webextension-api.thunderbird.net/en/mv3/cloudFile.html>

pydio cells expose rest api that can be find at <https://docs.pydio.com/latest/developer-guide/rest-api/index/>

the pydio instance URL and add-on id are set in the git-ignored build.local.json, which build.ps1 applies to the packaged files. lib/config.js and manifest.json keep the placeholder <https://cells.example.com> and must not be committed with real values.
