# Cart API

The cart is saved in PostgreSQL. Guests use an opaque cookie; authenticated customers use their existing access token. A selected variant determines the perfume, size and current price. Cart items never deduct or reserve stock.

## Setup

Apply the additive cart migration and regenerate Prisma before running this version:

```sh
yarn prisma migrate deploy
yarn prisma:generate
yarn start:dev
```

The migration adds `carts` and `cart_items`; it does not change product stock. It enforces one cart per account, one row per variant per cart, positive bounded quantities, and exactly one owner (account or guest token).

For a frontend on a different origin, explicitly allow it in the API environment:

```dotenv
CART_ALLOWED_ORIGINS=http://localhost:3000
```

Multiple trusted origins can be comma-separated. Do not add untrusted sites. Same-origin requests need no CORS configuration. Production cookies use `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no Domain attribute, and the `__Host-guest_cart` name. Development uses `guest_cart` without Secure.

Use a same-site deployment (for example `shop.example.com` and `api.example.com`), or a same-origin proxy. Unrelated frontend/API domains will not receive the Lax cookie on cross-site fetch requests; supporting those requires a deliberate cookie and CSRF configuration change. Keep proxy trust configuration explicit so client-IP rate limiting works behind your proxy.

## Calling the API

Every mutation requires `X-Cart-Request: 1`. Use `credentials: 'include'` so browsers store/send the guest cookie. The custom header plus the explicit origin allowlist prevents cross-origin form requests from modifying a cart. Do not expose or manually manage the HttpOnly guest token in frontend code.

```ts
const response = await fetch(`${apiUrl}/cart/items`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-Cart-Request': '1',
    // Add Authorization: `Bearer ${accessToken}` when logged in.
  },
  body: JSON.stringify({ variantId: 11, quantity: 2 }),
});
const cart = await response.json();
```

Quantity means bottles: two 10 ml variants consume 20 ml of demand in the cart. The body never accepts price, product stock, user ID or cart ID.

| Endpoint | Behavior |
| --- | --- |
| `GET /cart` | Current account cart when authenticated, otherwise guest cart |
| `POST /cart/items` | Add quantity to a variant, or create the line |
| `PATCH /cart/items/:id` | Set an absolute quantity |
| `DELETE /cart/items/:id` | Remove the scoped item |
| `DELETE /cart` | Clear the current cart |
| `POST /cart/merge` | Requires login; atomically merge the cookie's guest cart into the account |
| `GET /cart/guest` | Inspect the pending guest cart, even while logged in |
| `PATCH /cart/guest/items/:id` | Change a pending guest quantity to resolve a merge conflict |
| `DELETE /cart/guest/items/:id` | Remove a pending guest item to resolve a merge conflict |

No authorization header means guest access. An invalid, expired or wrong-type bearer token returns 401; it never silently falls back to a guest cart. Merge always requires an access token.

First successful guest addition creates the cart and cookie. Empty guest reads do not create database records. Serialize the first guest additions in the frontend until its first response sets the cookie; two requests without a cookie cannot be recognized as the same browser. Serialize cart mutations generally and render the returned cart. `POST /cart/items` is additive, so do not blindly retry it after an uncertain network outcome; reload the cart first.

## Shared stock rules

The backend sums all quantities for the affected perfume before accepting an addition or an increase. Other perfumes use their own independent stock pools. Carts may hold products from different shops; shipping and order grouping are future checkout decisions. All current prices are assumed to use the application's one currency.

With 40 ml available, an existing two 10 ml bottles plus a new 30 ml bottle returns 409:

```json
{
  "code": "CART_AVAILABILITY_CONFLICT",
  "reason": "INSUFFICIENT_STOCK",
  "productId": 1,
  "productName": "Imagination",
  "availableMl": 40,
  "inCartMl": 20,
  "requestedMl": 50,
  "remainingToAddMl": 20,
  "message": "Not enough perfume available or product no longer for sale"
}
```

The actual response also contains a `conflicts` array for all affected products. No addition is persisted on rejection. Inactive products and products in unapproved shops are rejected as `PRODUCT_UNAVAILABLE`.

Existing carts can become unavailable when somebody else buys stock or a shop is suspended. Reads preserve these items and return `hasAvailabilityIssues`, per-product `conflicts`, and per-line `available`. Decreasing or removing a stale item remains allowed, even if a smaller quantity still exceeds current stock. Increasing quantities requires a valid current balance. Hard-deleted variants are removed from carts by their foreign key; deactivated products remain visible as unavailable.

Each line includes `ml`, `quantity`, current `unitPrice`, `lineTotal`, `availableMl`, the product's total `inCartMl`, and `remainingToAddMl`. Money is calculated with Prisma Decimal and returned as two-decimal strings. `total` is an estimate at current prices, including unavailable lines; it is not an order or payment amount.

Changes use serializable transactions with up to three attempts on serialization/unique-key conflicts. Item operations are scoped to the resolved cart. Requests never trust a client-provided cart owner. No inventory or stock-movement writes occur in the cart service. Checkout must still recheck stock and prices later.

## Login and merging

The frontend must call `POST /cart/merge` after login succeeds, sending both the new access token and the existing cookie. Login itself does not perform the merge.

```ts
const response = await fetch(`${apiUrl}/cart/merge`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'X-Cart-Request': '1',
  },
});
```

- No account cart: claim the guest cart and remove its guest credentials.
- Existing account cart: combine quantities of identical variants; validate every product's combined ml.
- Success: consume the guest cart once, clear the guest cookie and return the account cart. Repeating merge with the old cookie does not add quantities twice.
- Conflict: roll back and preserve both original carts and the guest cookie. Login remains valid. Show the account cart (`GET /cart`) and pending guest cart (`GET /cart/guest`), let the customer reduce/remove lines using the corresponding endpoints, then retry merge.
- After a successful merge, use returned item IDs: account line IDs can change during the bulk replacement.
- After logout, stop sending the access token. The account cart remains private and saved for the next login. It never becomes a guest cart.

Do not silently hide a failed merge or display only the account cart as if guest items disappeared. Keep a visible "Finish merging your cart" action until resolved or explicitly abandoned.

## Limits and maintenance

A cart allows at most 100 distinct variants and 99 bottles per variant. Cart endpoints have an in-process limit of 120 requests/minute/IP. Multi-instance deployments need a shared or edge limiter.

Guest credentials are cryptographically random; only SHA-256 hashes are stored. Guests expire 30 days after their last successful modification; reads do not extend expiry. Account carts do not expire. Expired guest records cannot be accessed, but physical cleanup must be scheduled by deployment maintenance, for example:

```sql
DELETE FROM carts
WHERE id IN (
  SELECT id FROM carts
  WHERE user_id IS NULL AND expires_at <= CURRENT_TIMESTAMP
  ORDER BY expires_at
  LIMIT 1000
);
```

Repeat in batches as needed. Cart-item cleanup cascades from cart deletion. This release does not install a scheduler.

Orders, checkout, payments, reservations and automatic cancellation stock restoration are outside this feature.
