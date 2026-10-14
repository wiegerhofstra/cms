# Website revalidation

Apply the database migration with `npm run db:migrate` before deploying.

In **Settings → Revalidation**, select a tenant and save the full revalidation URL
and its token. For Ommelanden, use the deployed website’s `/api/revalidate` URL and
the value of its `CMS_REVALIDATION_SECRET` environment variable.

The **Revalidate** button appears in the tenant header once settings are saved.
Confirm the dialog to send a server-side `POST` with `Authorization: Bearer <token>`.
The settings header targets the active workspace, named in the confirmation dialog.
Administrators manage settings; tenant members and administrators can trigger
revalidation. Saving settings does not call the endpoint.

Leave the token blank on later saves to keep it. Clear the URL and save to remove
the configuration and hide the button. The token is never returned to the browser.
It is stored with authenticated AES-256-GCM encryption, bound to the tenant, using
a dedicated key derived from `BETTER_AUTH_SECRET`. If that secret is rotated,
save the revalidation tokens again.

Use HTTPS for deployed endpoints. Requests time out after 15 seconds and do not
follow redirects. Any successful HTTP status is accepted; other statuses are
reported without exposing the endpoint’s response body.

Run `npm run test:revalidation` for credential, validation, and HTTP contract tests.
