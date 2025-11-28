# Legal Management System - Backend API

Node.js and Express backend API for the Legal Management System.

## Features

- User authentication and authorization (JWT)
- User management
- Client management
- Case management
- Billing and invoicing
- Messaging system
- Legal notices management
- Role-based access control (Admin, Lawyer, Client)

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **express-validator** - Input validation

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

## Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/legalms
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
FRONTEND_URL=http://localhost:4200
```

4. Make sure MongoDB is running on your system.

## Running the Server

### Development Mode (with auto-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The server will start on `http://localhost:5000` (or the port specified in your `.env` file).

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - Get all users (Admin, Lawyer)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user (Admin)

### Clients
- `GET /api/clients` - Get all clients (Admin, Lawyer)
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client (Admin)

### Cases
- `GET /api/cases` - Get all cases
- `GET /api/cases/:id` - Get case by ID
- `POST /api/cases` - Create new case (Admin, Lawyer)
- `PUT /api/cases/:id` - Update case
- `PATCH /api/cases/:id/status` - Update case status
- `DELETE /api/cases/:id` - Delete case (Admin)

### Billing
- `GET /api/billing/time-entries` - Get time entries
- `POST /api/billing/time-entries` - Create time entry
- `GET /api/billing/invoices` - Get invoices
- `POST /api/billing/invoices` - Create invoice
- `PATCH /api/billing/invoices/:id/status` - Update invoice status

### Messages
- `GET /api/messages` - Get messages
- `GET /api/messages/unread-count` - Get unread count
- `POST /api/messages` - Create message
- `PATCH /api/messages/:id/read` - Mark message as read

### Notices
- `GET /api/notices` - Get notices
- `POST /api/notices` - Create notice (Admin, Lawyer)

### Case Types
- `GET /api/case-types` - Get case type configurations

### eCourt
- `GET /api/ecourt` - eCourt endpoint (Admin, Lawyer)

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Role-Based Access Control

- **Admin**: Full access to all features
- **Lawyer**: Access to assigned clients and cases, can create clients/cases
- **Client**: Can only view their own cases and invoices

## Database Models

- **User**: User accounts with roles
- **Client**: Client information
- **Case**: Legal cases
- **TimeEntry**: Time tracking for billing
- **Invoice**: Invoices and billing
- **Message**: Internal messaging
- **Notice**: Legal notices

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "message": "Error message",
  "errors": [] // For validation errors
}
```

## Development

- Use `nodemon` for auto-reload during development
- Environment variables are loaded from `.env` file
- CORS is configured to allow requests from the frontend

## License

ISC




