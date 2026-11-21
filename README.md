# Perfume API

NestJS + Prisma + PostgreSQL catalog with users, shops, categories, product variants and JWT sessions.

## Run locally

```sh
yarn install --frozen-lockfile
cp .env.example .env
# Edit DATABASE_URL, REDIS_URL (for BullMQ image optimization) and generate a random JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Set JWT_SECRET to the generated value.
yarn prisma:generate
yarn prisma migrate deploy
yarn start:dev
```

The API defaults to http://localhost:4001. Use a disposable database for testing. Apply the shared-stock migration before starting this version; see the inventory migration notes below.

Generated Prisma code is ignored by Git, so run `yarn prisma:generate` after installing or changing the schema. Production: `yarn build` then `yarn start:prod`. Compiled entrypoint: `dist/src/main.js`.

## Permissions

Authentication is required by default. Only explicitly `@Public()` routes skip access-token authentication. Refresh/logout still enforce their separate refresh-token guard.

| Endpoint                                    | Access                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /users`, `POST /auth/login`           | Public                                                                       |
| `GET /products`, `/products/:id`            | Public; active products in approved shops                                    |
| `GET /shops`, `/shops/:id`                  | Public; approved shops                                                       |
| `GET /categories`, `/categories/:id`        | Public                                                                       |
| `GET/PATCH /users/me`                       | Current authenticated user                                                   |
| `PATCH /users/me/password`                  | Current user, with current password                                          |
| `GET /users`, `GET/PATCH/DELETE /users/:id` | Super administrator                                                          |
| Shop/product creation, update and deletion  | `ADMIN` or `SUPER_ADMIN`; owner checks apply except for super administrators |
| `GET /shops/manage`, `GET /products/manage` | Own records including pending/drafts; super administrators see all           |
| `PATCH /shops/:id/status`                   | Super administrator; `PENDING`, `APPROVED`, or `SUSPENDED`                   |
| Category creation, update and deletion      | Super administrator                                                          |

New accounts default to `CUSTOMER`. For initial local setup, register your account, then use `yarn prisma studio` to assign its role to `SUPER_ADMIN`. An operator must provision seller roles (`ADMIN`) through trusted database tooling; public requests cannot set roles. Keep role provisioning out of public registration.

Shop creation derives `ownerId` from authentication: do not send it. A new shop is pending until approved. Ordinary product updates cannot change `shopId`.

## Tokens and passwords

Both token types use the same `JWT_SECRET`. Access tokens contain `type: "access"`; refresh tokens contain `type: "refresh"`. Each strategy rejects the wrong or missing type. Previously issued tokens without this claim are rejected: log in again after upgrading.

Send an access token in `Authorization: Bearer <accessToken>` for protected routes. Access tokens last 15 minutes; current account activity and role are read on each authenticated request.

For `POST /auth/refresh` and `POST /auth/logout`, send the **refresh token** in the same Bearer header. Refresh tokens last 30 days, are stored as SHA-256 hashes, and are consumed and replaced in one serializable transaction. Expired/used tokens return 401; simultaneous database conflicts return 409. Clients should serialize refresh calls instead of refreshing in parallel. A replay is rejected without revoking unrelated device sessions; token-family reuse detection is not implemented.

`POST /auth/logout-all` uses an access token and revokes all refresh sessions for that user.

Change a password using:

```http
PATCH /users/me/password
Authorization: Bearer <accessToken>
Content-Type: application/json

{"currentPassword":"old-password","newPassword":"new-password"}
```

The new hash and refresh-session revocation commit together. Existing access tokens may remain usable until their 15-minute expiry. Password updates are rejected on ordinary profile endpoints. New passwords require at least 8 characters and at most 72 UTF-8 bytes (bcrypt's input limit).

## Validation and business rules

- Unknown body/query properties return 400 instead of being silently ignored.
- Lists accept `?page=1&limit=20`; maximum page size is 100. The response remains an array. Category lists paginate roots and include their immediate children, not an entire recursive tree.
- Public product list/detail use the same visibility rules. Management lists include hidden records.
- Products must retain at least one variant. Removing the last variant rolls the update back.
- Category updates reject direct and indirect cycles. Category deletion still cascades through descendants; product references can prevent deletion.
- Product/shop deletion is blocked when products have stock-movement history. Deactivate products or suspend shops to preserve the ledger.
- Unique-value conflicts and related-record conflicts have controlled client responses. Transaction conflicts return 409 so clients can retry deliberately.
- Login is limited to 10 attempts per minute per IP in one application process. Multiple replicas need a shared/edge limiter. Configure trusted proxies explicitly before relying on forwarded client IPs.
- HTTP logging excludes request bodies, tokens and query strings.

## Checks

```sh
yarn typecheck
yarn lint
yarn test --runInBand
yarn test:e2e --runInBand
yarn build
```

Unit tests cover ownership, token rotation, password changes, category cycles, guards and DTO validation. HTTP tests boot the real app with real guards/strategies/pipes and a mocked database; they need permission to open a local port. Neither suite proves PostgreSQL transaction rollback or concurrency behavior: test those against a disposable PostgreSQL database before deployment.

No microservices needed: controller receives a request, guards check identity/role, DTOs validate input, services enforce ownership/business rules, Prisma stores the result.


## Shared perfume inventory

Stock belongs to `Product.stockMl` (whole millilitres). Variants contain size and price, never separate stock. A 500 ml supply can fill any combination of 10 ml and 30 ml variants.

Product creation accepts optional `stockMl` (default 0). Positive initial stock creates a `REFILL` movement atomically with the product. Product PATCH rejects `stockMl`; all subsequent changes must use stock movements so the ledger stays complete. Legacy variant `stock` fields are rejected in requests.

Public product list/detail and the protected management list include these fields per variant:

```json
{ "id": 11, "ml": 30, "available": true, "maxQuantity": 16 }
```

`maxQuantity = floor(stockMl / variant.ml)` is a per-size estimate, not a reservation. Two sizes consume the same supply, so their individual maximum quantities cannot both be purchased together. Prices remain independent per variant.

### Owner/admin inventory endpoints

All endpoints below require an access token and `ADMIN`/`SUPER_ADMIN`. Ordinary administrators must own the product's shop.

```http
POST /products/1/stock-movements
Content-Type: application/json

{"type":"REFILL","deltaMl":500,"note":"Added a new 500 ml bottle"}
```

Movement types:

| Type | Direction | Meaning |
| --- | --- | --- |
| `REFILL` | Positive | New perfume added |
| `SALE` | Negative | Perfume poured/sold |
| `RETURN` | Positive | Previously deducted stock actually restored, e.g. a cancelled unpoured sale |
| `SPILLAGE` | Negative | Lost perfume |
| `CORRECTION` | Positive or negative, never zero | Difference between recorded stock and a physical count |

Every movement requires a nonblank note and records its signed quantity, resulting balance, actor ID and timestamp. For a physical count of 450 ml while the system shows 500, use `CORRECTION` with `deltaMl: -50`; it is a difference, not an absolute balance. A customer refund alone does not mean usable perfume returned to the supply.

```http
GET /products/1/stock-movements?page=1&limit=20
```

For a manual sale involving several sizes, let the backend calculate the total:

```http
POST /products/1/stock-sales
Content-Type: application/json

{"items":[{"variantId":11,"quantity":2},{"variantId":12,"quantity":1}],"note":"Counter sale"}
```

If variant 11 is 10 ml and variant 12 is 30 ml, this removes `(10 × 2) + (30 × 1) = 50 ml` in a single movement. Repeated variant entries are included in the total. Every variant must belong to the selected product. With only 40 ml available, the entire operation fails with 409 and no stock is removed.

The balance update uses a conditional database increment/decrement and a serializable transaction with the ledger insert. Stock cannot go below zero. Concurrent serialization conflicts return 409. These are manual inventory operations, not order/payment endpoints: repeated successful POSTs record separate movements. Do not automatically repeat a request after an uncertain network outcome; check history first. Future checkout must add order-based idempotency and use one transaction across the order and all affected products. Cart, reservations, payments and automatic cancellation restoration are not implemented yet.

### Inventory migration

Migration `20261114000000_shared_perfume_stock` archives the old `(variant_id, product_id, ml, stock)` records in `legacy_variant_stock`, removes `ProductVariant.stock`, adds shared stock and the movement ledger, and enforces nonnegative stock in PostgreSQL. The archive has no cascading relations, so historical counts survive later product deletion.

**Existing products start with `stockMl: 0`.** We cannot know whether the old counts represented separate prefilled bottles or duplicate counts of a shared bottle. Do not sum them automatically.

1. Back up your database and stop the old application during the migration.
2. Run `yarn prisma migrate deploy` and `yarn prisma:generate`.
3. Restart the updated application.
4. Measure the actual remaining ml for each product and record a positive `CORRECTION` from its initial zero balance, with a note such as "Opening shared-bottle physical count".
5. Keep `legacy_variant_stock` until reconciliation is complete; it is archival data, not live inventory.

The application changes do not apply migrations automatically. Inventory currently supports whole ml only. Stock history prevents hard deletion of products (and their shops); use `isActive: false` or shop suspension instead.

## Guest and customer carts

The cart API supports guest cookies, customer account carts, per-product shared-ml checks, Decimal totals, and an explicit guest-to-account merge after login. Adds and quantity increases fail when the combined ml exceeds stock; no stock is reserved. A failed merge preserves both carts.

Apply `20261116000000_add_carts` before using the API. See [docs/cart.md](docs/cart.md) for endpoints, cookie/CORS setup, stock-conflict responses, login merging and guest-cart cleanup.
