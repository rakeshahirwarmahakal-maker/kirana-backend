# store-platform Backend

This folder contains the unified backend for the Kirana Store app, including Seller app and Admin panel APIs.

## Setup

1. Copy `.env.example` to `.env`
2. Update database credentials and JWT secret in `.env`
3. Run:
   ```bash
   npm install
   npm run dev
   ```

The server runs on `http://localhost:3000` by default.

## Important APIs

### Authentication
- `POST /api/auth/login` - Login with email or phone
- `POST /api/auth/register-email` - Register normal user
- `POST /api/auth/register-seller` - Register a seller/store owner
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/register-phone` - Register with phone + OTP
- `GET /api/auth/profile` - Get current user profile

### Seller App
- `GET /api/seller/store` - Seller store profile
- `PUT /api/seller/store` - Update seller store profile
- `GET /api/seller/products` - Seller product list
- `POST /api/seller/products` - Add product
- `PUT /api/seller/products/:id` - Update product
- `DELETE /api/seller/products/:id` - Delete product
- `POST /api/seller/products/bulk` - Bulk upload products from CSV or JSON array
- `GET /api/seller/orders` - Seller order list
- `PUT /api/seller/orders/:itemId/status` - Update seller order item status
- `POST /api/seller/delivery/boys` - Add delivery boy
- `GET /api/seller/delivery/boys` - List delivery boys
- `PUT /api/seller/orders/:itemId/assign-delivery` - Assign delivery boy
- `GET /api/seller/earnings` - Seller earnings summary
- `GET /api/seller/inventory/low-stock` - Low stock alerts

### Admin Panel
- `GET /api/admin/dashboard` - Admin dashboard stats
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id/status` - Ban/unban user
- `GET /api/admin/sellers` - List sellers
- `PUT /api/admin/sellers/:id/approve` - Approve seller
- `PUT /api/admin/sellers/:id/reject` - Reject seller
- `GET /api/admin/orders` - List all orders
- `PUT /api/admin/orders/:id/status` - Update order status
- `GET /api/admin/areas` - List service areas
- `POST /api/admin/areas` - Add service area
- `PUT /api/admin/areas/:id` - Update service area
- `GET /api/admin/promotions` - List promotions
- `POST /api/admin/promotions` - Create promotion

### User / Geo
- `GET /api/geo/stores?lat=<lat>&lng=<lng>&max_km=3` - Nearby stores within distance

## Notes
- Use the token returned from login in `Authorization: Bearer <token>` header.
- The backend supports separate seller and admin workflows with role-based access.
- You can open this same folder on another laptop and use the existing seller/admin UI with this backend.
