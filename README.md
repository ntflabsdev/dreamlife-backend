# DreamLife Backend API

A Node.js/TypeScript backend API for the DreamLife application that processes questionnaires and generates personalized 3D dream worlds.

## Features

- **Questionnaire Management**: Save and retrieve user responses across 12 life categories
- **Dream World Generation**: AI-powered 3D world creation based on questionnaire data
- **Contact Management**: Handle contact form submissions
- **Session Management**: Support for anonymous users with session-based tracking
- **Real-time Processing**: Asynchronous dream world generation with status tracking

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Security**: Helmet, CORS, Rate limiting
- **Validation**: Custom validation middleware
- **Development**: Nodemon, ESLint

## API Endpoints

### Questionnaire
- `POST /api/questionnaire` - Save/update questionnaire
- `GET /api/questionnaire/:sessionId` - Get questionnaire by session
- `PATCH /api/questionnaire/:sessionId/answer` - Update single answer
- `POST /api/questionnaire/:sessionId/complete` - Mark questionnaire complete

### Dream World
- `POST /api/dream-world/generate` - Generate 3D world from questionnaire
- `GET /api/dream-world/:sessionId` - Get dream world data and status

### Contact
- `POST /api/contact` - Submit contact form
- `GET /api/contact` - Get all contacts (admin)
- `PATCH /api/contact/:id/status` - Update contact status (admin)

### User/Session
- `POST /api/users/session` - Create anonymous user session
- `GET /api/users/session/:sessionId` - Get user session info

### Health Check
- `GET /health` - API health status

## Setup Instructions

1. **Install Dependencies**
   ```bash
   cd dreamlife-backend
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   - Install MongoDB locally or use MongoDB Atlas
   - Update `MONGODB_URI` in .env file

4. **Development**
   ```bash
   npm run dev
   ```

5. **Production Build**
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/dreamlife` |
| `JWT_SECRET` | JWT secret key | - |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:5173` |
| `OPENAI_API_KEY` | OpenAI API key for AI generation | - |
| `SMTP_*` | Email configuration for contact form | - |

## Data Models

### Questionnaire
- Stores user responses across 12 life categories
- Tracks completion status and progress
- Supports both anonymous and registered users

### DreamWorld
- Generated 3D world data based on questionnaire
- Includes environment, colors, assets, and metadata
- Tracks generation status and processing time

### Contact
- Contact form submissions
- Status tracking (unread/read/responded)
- IP and user agent logging for security

### User
- Anonymous session management
- Session-based tracking
- Future support for registered users

## AI Integration

The backend is designed to integrate with various AI services:

- **OpenAI GPT-4**: For generating world descriptions and narratives
- **Stability AI**: For generating visual assets and textures
- **3D Asset Generation**: Future integration with 3D model generation services

## Security Features

- Rate limiting (100 requests per 15 minutes)
- CORS protection with configurable origins
- Helmet.js security headers
- Input validation and sanitization
- Error handling with secure error messages

## Development Commands

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run tests (when implemented)

## Frontend Integration

The backend is designed to work with the React/TypeScript frontend:

1. **Session Creation**: Frontend creates anonymous session on app load
2. **Questionnaire Flow**: Progressive saving of answers as user navigates
3. **Dream Generation**: Asynchronous processing with status polling
4. **Contact Forms**: Direct form submission handling

## Future Enhancements

- User authentication and registration
- Payment processing integration
- Advanced AI model integration
- Real-time notifications
- Admin dashboard
- Analytics and reporting
- File upload for custom assets
- Email notifications
- Caching layer (Redis)
- API documentation with Swagger
