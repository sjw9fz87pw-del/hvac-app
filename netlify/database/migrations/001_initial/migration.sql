-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SERVICE_MANAGER', 'TECHNICIAN', 'CUSTOMER_ORG_OWNER', 'CUSTOMER_LOCATION_MANAGER', 'CUSTOMER_STAFF');

-- CreateEnum
CREATE TYPE "public"."EquipmentCategory" AS ENUM ('REFRIGERATION', 'HVAC', 'ICE_MACHINE', 'WATER_FILTRATION', 'COOKING', 'WAREWASHING', 'BEVERAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."EquipmentStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'NEEDS_ATTENTION', 'OUT_OF_SERVICE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."EquipmentCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."Criticality" AS ENUM ('CRITICAL', 'HIGH', 'STANDARD', 'LOW');

-- CreateEnum
CREATE TYPE "public"."TagState" AS ENUM ('UNASSIGNED', 'ACTIVE', 'REVOKED', 'LOST');

-- CreateEnum
CREATE TYPE "public"."TagEventType" AS ENUM ('MINTED', 'WRITTEN', 'WRITE_FAILED', 'VERIFIED', 'VERIFY_FAILED', 'PAIRED', 'UNPAIRED', 'REASSIGNED', 'REPLACED', 'REVOKED', 'READ', 'READ_DENIED', 'TESTED');

-- CreateEnum
CREATE TYPE "public"."PlanScope" AS ENUM ('SYSTEM', 'CUSTOMER', 'LOCATION', 'ASSET');

-- CreateEnum
CREATE TYPE "public"."ScheduleStatus" AS ENUM ('UPCOMING', 'SCHEDULE_NEEDED', 'DUE', 'OVERDUE', 'PAUSED');

-- CreateEnum
CREATE TYPE "public"."VisitStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "public"."PhotoKind" AS ENUM ('IDENTIFICATION', 'DATA_PLATE', 'BEFORE', 'AFTER', 'ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."IssueSource" AS ENUM ('CUSTOMER', 'TECHNICIAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."IssueStatus" AS ENUM ('OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "public"."IssueSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('UPCOMING_SERVICE', 'SERVICE_COMPLETED', 'ISSUE_FOUND', 'ISSUE_RESOLVED', 'CUSTOMER_ADDED_EQUIPMENT', 'OVERDUE_MAINTENANCE', 'INCOMPLETE_PROOF', 'NFC_PROBLEM', 'VISIT_SCHEDULED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."ServiceCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "serviceCompanyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "organizationId" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerOrganization" (
    "id" TEXT NOT NULL,
    "serviceCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billingEmail" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RestaurantLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "phone" TEXT,
    "accessNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Area" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Equipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "areaId" TEXT,
    "name" TEXT NOT NULL,
    "category" "public"."EquipmentCategory" NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "internalAssetId" TEXT NOT NULL,
    "yearInstalled" INTEGER,
    "status" "public"."EquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "condition" "public"."EquipmentCondition" NOT NULL DEFAULT 'UNKNOWN',
    "criticality" "public"."Criticality" NOT NULL DEFAULT 'STANDARD',
    "filterSize" TEXT,
    "filterType" TEXT,
    "filterQuantity" INTEGER,
    "warrantyProvider" TEXT,
    "warrantyExpires" TIMESTAMP(3),
    "warrantyNotes" TEXT,
    "vendorId" TEXT,
    "technicianNotes" TEXT,
    "customerVisibleNotes" TEXT,
    "createdById" TEXT,
    "createdBySource" TEXT NOT NULL DEFAULT 'INTERNAL',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedReason" TEXT,
    "replacedByAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EquipmentPhoto" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "kind" "public"."PhotoKind" NOT NULL DEFAULT 'IDENTIFICATION',
    "blobKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EquipmentDocument" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "blobKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "tokenId" TEXT NOT NULL,
    "macPrefix" TEXT NOT NULL,
    "tenantHint" TEXT NOT NULL,
    "state" "public"."TagState" NOT NULL DEFAULT 'UNASSIGNED',
    "label" TEXT,
    "hardwareUid" TEXT,
    "writtenAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TagAssignment" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "unassignedAt" TIMESTAMP(3),
    "unassignedById" TEXT,
    "unassignReason" TEXT,

    CONSTRAINT "TagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TagEvent" (
    "id" TEXT NOT NULL,
    "tagId" TEXT,
    "equipmentId" TEXT,
    "actorId" TEXT,
    "type" "public"."TagEventType" NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServiceType" (
    "id" TEXT NOT NULL,
    "serviceCompanyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "public"."EquipmentCategory" NOT NULL,
    "defaultIntervalDays" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 20,
    "requiresNfcVerification" BOOLEAN NOT NULL DEFAULT true,
    "requiresBeforePhoto" BOOLEAN NOT NULL DEFAULT true,
    "requiresAfterPhoto" BOOLEAN NOT NULL DEFAULT true,
    "requiresChecklist" BOOLEAN NOT NULL DEFAULT true,
    "requiresTechnicianNote" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChecklistItemTemplate" (
    "id" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "inputType" TEXT NOT NULL DEFAULT 'CHECK',
    "choices" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ChecklistItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenancePlan" (
    "id" TEXT NOT NULL,
    "scope" "public"."PlanScope" NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "organizationId" TEXT,
    "locationId" TEXT,
    "equipmentId" TEXT,
    "category" "public"."EquipmentCategory",
    "intervalDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "intervalSource" "public"."PlanScope" NOT NULL DEFAULT 'SYSTEM',
    "lastServiceAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."ScheduleStatus" NOT NULL DEFAULT 'UPCOMING',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Visit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "technicianId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "public"."VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "reportGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VisitTask" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skipReason" TEXT,

    CONSTRAINT "VisitTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServiceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "visitId" TEXT,
    "visitTaskId" TEXT,
    "technicianId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "technicianNotes" TEXT,
    "customerVisibleNotes" TEXT,
    "issuesFoundCount" INTEGER NOT NULL DEFAULT 0,
    "nextDueAt" TIMESTAMP(3),
    "nfcVerified" BOOLEAN NOT NULL DEFAULT false,
    "nfcTagId" TEXT,
    "verificationMethod" TEXT,
    "checklistResults" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL,
    "supersedesId" TEXT,
    "supersededReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServicePhoto" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "kind" "public"."PhotoKind" NOT NULL,
    "blobKey" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Issue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "serviceRecordId" TEXT,
    "source" "public"."IssueSource" NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "public"."IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "public"."IssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportedById" TEXT,
    "assignedToId" TEXT,
    "vendorId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IssuePhoto" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "blobKey" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IssueEvent" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vendor" (
    "id" TEXT NOT NULL,
    "serviceCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServicePlan" (
    "id" TEXT NOT NULL,
    "serviceCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingPeriod" TEXT NOT NULL DEFAULT 'MONTHLY',
    "basePriceCents" INTEGER NOT NULL DEFAULT 0,
    "perAssetCents" INTEGER NOT NULL DEFAULT 0,
    "perLocationCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanLineItem" (
    "id" TEXT NOT NULL,
    "servicePlanId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "category" "public"."EquipmentCategory",
    "intervalDays" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "servicePlanId" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionAsset" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB,
    "statusCode" INTEGER NOT NULL DEFAULT 200,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SyncBatch" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensorDevice" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensorReading" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Part" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PartUsage" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RepairCost" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "vendorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiExtraction" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT,
    "photoBlobKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DATA_PLATE',
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION,
    "model" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCompany_slug_key" ON "public"."ServiceCompany"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_serviceCompanyId_idx" ON "public"."User"("serviceCompanyId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "public"."Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "public"."Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_locationId_idx" ON "public"."Membership"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_role_organizationId_locationId_key" ON "public"."Membership"("userId", "role", "organizationId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "CustomerOrganization_serviceCompanyId_idx" ON "public"."CustomerOrganization"("serviceCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrganization_serviceCompanyId_slug_key" ON "public"."CustomerOrganization"("serviceCompanyId", "slug");

-- CreateIndex
CREATE INDEX "RestaurantLocation_organizationId_idx" ON "public"."RestaurantLocation"("organizationId");

-- CreateIndex
CREATE INDEX "Area_locationId_idx" ON "public"."Area"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Area_locationId_name_key" ON "public"."Area"("locationId", "name");

-- CreateIndex
CREATE INDEX "Equipment_organizationId_status_idx" ON "public"."Equipment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Equipment_locationId_status_idx" ON "public"."Equipment"("locationId", "status");

-- CreateIndex
CREATE INDEX "Equipment_areaId_idx" ON "public"."Equipment"("areaId");

-- CreateIndex
CREATE INDEX "Equipment_model_idx" ON "public"."Equipment"("model");

-- CreateIndex
CREATE INDEX "Equipment_serialNumber_idx" ON "public"."Equipment"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_organizationId_internalAssetId_key" ON "public"."Equipment"("organizationId", "internalAssetId");

-- CreateIndex
CREATE INDEX "EquipmentPhoto_equipmentId_kind_idx" ON "public"."EquipmentPhoto"("equipmentId", "kind");

-- CreateIndex
CREATE INDEX "EquipmentDocument_equipmentId_idx" ON "public"."EquipmentDocument"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tokenId_key" ON "public"."Tag"("tokenId");

-- CreateIndex
CREATE INDEX "Tag_organizationId_state_idx" ON "public"."Tag"("organizationId", "state");

-- CreateIndex
CREATE INDEX "Tag_state_idx" ON "public"."Tag"("state");

-- CreateIndex
CREATE INDEX "TagAssignment_tagId_idx" ON "public"."TagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "TagAssignment_equipmentId_idx" ON "public"."TagAssignment"("equipmentId");

-- CreateIndex
CREATE INDEX "TagEvent_tagId_createdAt_idx" ON "public"."TagEvent"("tagId", "createdAt");

-- CreateIndex
CREATE INDEX "TagEvent_type_createdAt_idx" ON "public"."TagEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_serviceCompanyId_key_key" ON "public"."ServiceType"("serviceCompanyId", "key");

-- CreateIndex
CREATE INDEX "ChecklistItemTemplate_serviceTypeId_idx" ON "public"."ChecklistItemTemplate"("serviceTypeId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_scope_serviceTypeId_idx" ON "public"."MaintenancePlan"("scope", "serviceTypeId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_organizationId_idx" ON "public"."MaintenancePlan"("organizationId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_locationId_idx" ON "public"."MaintenancePlan"("locationId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_equipmentId_idx" ON "public"."MaintenancePlan"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_nextDueAt_status_idx" ON "public"."MaintenanceSchedule"("nextDueAt", "status");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_status_idx" ON "public"."MaintenanceSchedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceSchedule_equipmentId_serviceTypeId_key" ON "public"."MaintenanceSchedule"("equipmentId", "serviceTypeId");

-- CreateIndex
CREATE INDEX "Visit_locationId_scheduledFor_idx" ON "public"."Visit"("locationId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Visit_technicianId_scheduledFor_idx" ON "public"."Visit"("technicianId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Visit_status_scheduledFor_idx" ON "public"."Visit"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "VisitTask_visitId_status_idx" ON "public"."VisitTask"("visitId", "status");

-- CreateIndex
CREATE INDEX "VisitTask_equipmentId_idx" ON "public"."VisitTask"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitTask_visitId_equipmentId_serviceTypeId_key" ON "public"."VisitTask"("visitId", "equipmentId", "serviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_visitTaskId_key" ON "public"."ServiceRecord"("visitTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_supersedesId_key" ON "public"."ServiceRecord"("supersedesId");

-- CreateIndex
CREATE INDEX "ServiceRecord_equipmentId_performedAt_idx" ON "public"."ServiceRecord"("equipmentId", "performedAt");

-- CreateIndex
CREATE INDEX "ServiceRecord_organizationId_performedAt_idx" ON "public"."ServiceRecord"("organizationId", "performedAt");

-- CreateIndex
CREATE INDEX "ServiceRecord_locationId_performedAt_idx" ON "public"."ServiceRecord"("locationId", "performedAt");

-- CreateIndex
CREATE INDEX "ServiceRecord_technicianId_performedAt_idx" ON "public"."ServiceRecord"("technicianId", "performedAt");

-- CreateIndex
CREATE INDEX "ServicePhoto_serviceRecordId_kind_idx" ON "public"."ServicePhoto"("serviceRecordId", "kind");

-- CreateIndex
CREATE INDEX "Issue_organizationId_status_idx" ON "public"."Issue"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Issue_locationId_status_idx" ON "public"."Issue"("locationId", "status");

-- CreateIndex
CREATE INDEX "Issue_equipmentId_createdAt_idx" ON "public"."Issue"("equipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "IssuePhoto_issueId_idx" ON "public"."IssuePhoto"("issueId");

-- CreateIndex
CREATE INDEX "IssueEvent_issueId_createdAt_idx" ON "public"."IssueEvent"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanLineItem_servicePlanId_idx" ON "public"."PlanLineItem"("servicePlanId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_status_idx" ON "public"."Subscription"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionAsset_subscriptionId_idx" ON "public"."SubscriptionAsset"("subscriptionId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "public"."AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "public"."AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "public"."AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_type_dedupeKey_key" ON "public"."Notification"("userId", "type", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "public"."NotificationPreference"("userId", "type");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "public"."IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_actorId_key_key" ON "public"."IdempotencyKey"("actorId", "key");

-- CreateIndex
CREATE INDEX "SyncBatch_actorId_createdAt_idx" ON "public"."SyncBatch"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SensorDevice_externalId_key" ON "public"."SensorDevice"("externalId");

-- CreateIndex
CREATE INDEX "SensorDevice_equipmentId_idx" ON "public"."SensorDevice"("equipmentId");

-- CreateIndex
CREATE INDEX "SensorReading_deviceId_recordedAt_idx" ON "public"."SensorReading"("deviceId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_key" ON "public"."Part"("sku");

-- CreateIndex
CREATE INDEX "PartUsage_equipmentId_usedAt_idx" ON "public"."PartUsage"("equipmentId", "usedAt");

-- CreateIndex
CREATE INDEX "RepairCost_equipmentId_incurredAt_idx" ON "public"."RepairCost"("equipmentId", "incurredAt");

-- CreateIndex
CREATE INDEX "AiExtraction_equipmentId_idx" ON "public"."AiExtraction"("equipmentId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_serviceCompanyId_fkey" FOREIGN KEY ("serviceCompanyId") REFERENCES "public"."ServiceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerOrganization" ADD CONSTRAINT "CustomerOrganization_serviceCompanyId_fkey" FOREIGN KEY ("serviceCompanyId") REFERENCES "public"."ServiceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RestaurantLocation" ADD CONSTRAINT "RestaurantLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Area" ADD CONSTRAINT "Area_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Equipment" ADD CONSTRAINT "Equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Equipment" ADD CONSTRAINT "Equipment_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "public"."Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Equipment" ADD CONSTRAINT "Equipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Equipment" ADD CONSTRAINT "Equipment_replacedByAssetId_fkey" FOREIGN KEY ("replacedByAssetId") REFERENCES "public"."Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipmentPhoto" ADD CONSTRAINT "EquipmentPhoto_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipmentDocument" ADD CONSTRAINT "EquipmentDocument_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagAssignment" ADD CONSTRAINT "TagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagAssignment" ADD CONSTRAINT "TagAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagEvent" ADD CONSTRAINT "TagEvent_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceType" ADD CONSTRAINT "ServiceType_serviceCompanyId_fkey" FOREIGN KEY ("serviceCompanyId") REFERENCES "public"."ServiceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistItemTemplate" ADD CONSTRAINT "ChecklistItemTemplate_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "public"."ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "public"."ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "public"."ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Visit" ADD CONSTRAINT "Visit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Visit" ADD CONSTRAINT "Visit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Visit" ADD CONSTRAINT "Visit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VisitTask" ADD CONSTRAINT "VisitTask_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "public"."Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VisitTask" ADD CONSTRAINT "VisitTask_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VisitTask" ADD CONSTRAINT "VisitTask_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "public"."ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VisitTask" ADD CONSTRAINT "VisitTask_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "public"."ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "public"."Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_visitTaskId_fkey" FOREIGN KEY ("visitTaskId") REFERENCES "public"."VisitTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceRecord" ADD CONSTRAINT "ServiceRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "public"."ServiceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicePhoto" ADD CONSTRAINT "ServicePhoto_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "public"."ServiceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."RestaurantLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "public"."ServiceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IssuePhoto" ADD CONSTRAINT "IssuePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "public"."Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IssueEvent" ADD CONSTRAINT "IssueEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "public"."Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Vendor" ADD CONSTRAINT "Vendor_serviceCompanyId_fkey" FOREIGN KEY ("serviceCompanyId") REFERENCES "public"."ServiceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicePlan" ADD CONSTRAINT "ServicePlan_serviceCompanyId_fkey" FOREIGN KEY ("serviceCompanyId") REFERENCES "public"."ServiceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanLineItem" ADD CONSTRAINT "PlanLineItem_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "public"."ServicePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanLineItem" ADD CONSTRAINT "PlanLineItem_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "public"."ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "public"."ServicePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionAsset" ADD CONSTRAINT "SubscriptionAsset_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionAsset" ADD CONSTRAINT "SubscriptionAsset_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensorDevice" ADD CONSTRAINT "SensorDevice_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensorReading" ADD CONSTRAINT "SensorReading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."SensorDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartUsage" ADD CONSTRAINT "PartUsage_partId_fkey" FOREIGN KEY ("partId") REFERENCES "public"."Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PartUsage" ADD CONSTRAINT "PartUsage_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RepairCost" ADD CONSTRAINT "RepairCost_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiExtraction" ADD CONSTRAINT "AiExtraction_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

