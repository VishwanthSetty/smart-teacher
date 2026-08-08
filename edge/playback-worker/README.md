# Playback edge worker

This Worker is the production media delivery plane. The API remains the only entitlement authority: it mints a short-lived ES256 JWT after `findPlayableVisibleTo` succeeds. The Worker receives only public verification keys and reads media through the `MEDIA` R2 binding. Never place the API signing key in Worker configuration.

## Key setup

```bash
openssl ecparam -genkey -name prime256v1 -noout -out playback-key.pem
openssl pkcs8 -topk8 -nocrypt -in playback-key.pem -out playback-key.pkcs8.pem
base64 -w0 playback-key.pkcs8.pem
openssl ec -in playback-key.pem -pubout -out playback-pub.pem
```

The base64 PKCS#8 value becomes `PLAYBACK_SIGNING_PRIVATE_KEY_B64` in the API only. Convert `playback-pub.pem` to a P-256 JWK with the same `kid` as `PLAYBACK_SIGNING_KEY_ID`; set that JSON as `PLAYBACK_PUBLIC_JWK`. A JWKS object (`{"keys": [...]}`) is also accepted for rotation.

## Deploy

1. Create the R2 bucket and update `bucket_name` under `[[r2_buckets]]`.
2. Replace the example route with `videos.<domain>/*` and its zone.
3. Set `ALLOWED_ORIGINS` to a comma-separated list of exact web origins. Wildcards are intentionally unsupported.
4. Set the issuer to `smart-teacher-api`, audience to `smart-teacher-playback`, and publish the public JWK.
5. Run `npm install`, `npm test`, then `npx wrangler deploy`.

For local development, run `npx wrangler dev` and configure the API with `PLAYBACK_DELIVERY_MODE=edge` and `PLAYBACK_EDGE_ORIGIN=http://localhost:8787`. Production object storage may be R2's S3-compatible API for ingest/transcoding while this Worker reads the same bucket through its native binding.

## Rotation

Publish a JWKS containing both the old and new `kid` first. Then switch the API's `PLAYBACK_SIGNING_KEY_ID` and private key. After every token signed by the old key has expired, remove the old public JWK. Never switch the API before the Worker accepts the new public key.
