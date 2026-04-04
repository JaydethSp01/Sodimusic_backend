-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistCity" TEXT NOT NULL,
    "artistCountry" TEXT NOT NULL DEFAULT 'Colombia',
    "year" INTEGER NOT NULL,
    "genre" TEXT NOT NULL,
    "coverUrl" TEXT,
    "spotifyUrl" TEXT,
    "youtubeUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "releaseYear" INTEGER NOT NULL,
    "coverUrl" TEXT,
    "spotifyUrl" TEXT,
    "youtubeUrl" TEXT,
    "description" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "upcoming" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "bpm" INTEGER,
    "mood" TEXT,
    "priceCOP" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "audioUrl" TEXT,
    "coverUrl" TEXT,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSession" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistEmail" TEXT NOT NULL,
    "artistPhone" TEXT NOT NULL,
    "artistInstagram" TEXT,
    "musicReference" TEXT NOT NULL,
    "vision" TEXT,
    "genres" TEXT NOT NULL,
    "isFirstTime" BOOLEAN NOT NULL DEFAULT true,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "internalNotes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable (estado previo a la migración de dateKey/scope)
CREATE TABLE "BlockedDate" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL,
    "publishedJson" JSONB NOT NULL,
    "draftJson" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "draftUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Production_genre_idx" ON "Production"("genre");

-- CreateIndex
CREATE INDEX "Production_year_idx" ON "Production"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Release_slug_key" ON "Release"("slug");

-- CreateIndex
CREATE INDEX "Release_genre_idx" ON "Release"("genre");

-- CreateIndex
CREATE INDEX "Release_releaseYear_idx" ON "Release"("releaseYear");

-- CreateIndex
CREATE INDEX "Release_upcoming_idx" ON "Release"("upcoming");

-- CreateIndex
CREATE INDEX "Beat_genre_idx" ON "Beat"("genre");

-- CreateIndex
CREATE INDEX "Beat_status_idx" ON "Beat"("status");

-- CreateIndex
CREATE INDEX "BookingSession_status_idx" ON "BookingSession"("status");

-- CreateIndex
CREATE INDEX "BookingSession_scheduledDate_idx" ON "BookingSession"("scheduledDate");

-- CreateIndex
CREATE INDEX "BookingSession_artistEmail_idx" ON "BookingSession"("artistEmail");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
