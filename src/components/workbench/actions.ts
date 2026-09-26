"use server";

import { refresh } from "next/cache";

import {
  archiveModel,
  completeAssetUpload,
  assignTenantToUser,
  createChild,
  createEntry,
  createField,
  createManagedUser,
  createModel,
  createTenant,
  deleteAsset,
  deleteEntry,
  deleteField,
  deleteManagedUser,
  deleteModel,
  moveField,
  presignAssetUpload,
  publishEntry,
  reorderChildren,
  removeTenantFromUser,
  switchTenant,
  unpublishEntry,
  updateEntry,
  updateAsset,
  updateField,
  updateManagedUser,
  updateModel,
} from "@/lib/cms/workbench";
import { createAccessToken, revokeAccessToken, updateAccessToken } from "@/modules/access-tokens/service";

export async function createAccessTokenAction(input: { name: string; tenantId: string; expiresInDays: number | null }) {
  const result = await createAccessToken(input);
  refresh();
  return result;
}

export async function updateAccessTokenAction(accessTokenId: string, input: { name: string }) {
  const result = await updateAccessToken(accessTokenId, input);
  refresh();
  return result;
}

export async function revokeAccessTokenAction(accessTokenId: string) {
  const result = await revokeAccessToken(accessTokenId);
  refresh();
  return result;
}

export async function createTenantAction(input: { name: string; slug?: string }) {
  const result = await createTenant(input);
  refresh();
  return result;
}

export async function switchTenantAction(tenantId: string) {
  const result = await switchTenant(tenantId);
  refresh();
  return result;
}

export async function createManagedUserAction(input: {
  name: string;
  email: string;
  password: string;
  role?: "admin" | "user";
  memberships?: { tenantId: string; role: "owner" | "editor" }[];
}) {
  const result = await createManagedUser(input);
  refresh();
  return result;
}

export async function updateManagedUserAction(
  userId: string,
  input: { name?: string; email?: string; password?: string; role?: "admin" | "user" },
) {
  const result = await updateManagedUser(userId, input);
  refresh();
  return result;
}

export async function deleteManagedUserAction(userId: string) {
  const result = await deleteManagedUser(userId);
  refresh();
  return result;
}

export async function assignTenantToUserAction(userId: string, input: { tenantId: string; role: "owner" | "editor" }) {
  const result = await assignTenantToUser(userId, input);
  refresh();
  return result;
}

export async function removeTenantFromUserAction(userId: string, tenantId: string) {
  const result = await removeTenantFromUser(userId, tenantId);
  refresh();
  return result;
}

export async function createModelAction(tenantSlug: string, input: { name: string; slug: string; fields?: unknown[] }) {
  const result = await createModel(input, tenantSlug);
  refresh();
  return result;
}

export async function updateModelAction(tenantSlug: string, modelId: string, input: { name?: string; status?: "active" | "archived" }) {
  const result = await updateModel(modelId, input, tenantSlug);
  refresh();
  return result;
}

export async function archiveModelAction(tenantSlug: string, modelId: string) {
  const result = await archiveModel(modelId, tenantSlug);
  refresh();
  return result;
}

export async function deleteModelAction(tenantSlug: string, modelId: string) {
  const result = await deleteModel(modelId, tenantSlug);
  refresh();
  return result;
}

export async function createFieldAction(tenantSlug: string, modelId: string, input: unknown) {
  const result = await createField(modelId, input, tenantSlug);
  refresh();
  return result;
}

export async function updateFieldAction(tenantSlug: string, modelId: string, fieldId: string, input: unknown) {
  const result = await updateField(modelId, fieldId, input, tenantSlug);
  refresh();
  return result;
}

export async function moveFieldAction(tenantSlug: string, modelId: string, input: { fieldId: string; direction: "up" | "down" }) {
  const result = await moveField(modelId, input, tenantSlug);
  refresh();
  return result;
}

export async function deleteFieldAction(tenantSlug: string, modelId: string, fieldId: string) {
  const result = await deleteField(modelId, fieldId, tenantSlug);
  refresh();
  return result;
}

export async function createEntryAction(tenantSlug: string, modelId: string, data: Record<string, unknown>) {
  const result = await createEntry(modelId, data, tenantSlug);
  refresh();
  return result;
}

export async function updateEntryAction(tenantSlug: string, entryId: string, data: Record<string, unknown>) {
  const result = await updateEntry(entryId, data, tenantSlug);
  refresh();
  return result;
}

export async function deleteEntryAction(tenantSlug: string, entryId: string) {
  const result = await deleteEntry(entryId, tenantSlug);
  refresh();
  return result;
}

export async function publishEntryAction(tenantSlug: string, entryId: string) {
  const result = await publishEntry(entryId, tenantSlug);
  refresh();
  return result;
}

export async function unpublishEntryAction(tenantSlug: string, entryId: string) {
  const result = await unpublishEntry(entryId, tenantSlug);
  refresh();
  return result;
}

export async function createChildAction(tenantSlug: string, entryId: string, input: { fieldId: string; childEntryId?: string; data?: Record<string, unknown> }) {
  const result = await createChild(entryId, input, tenantSlug);
  refresh();
  return result;
}

export async function reorderChildrenAction(tenantSlug: string, entryId: string, input: { fieldId: string; childEntryIds: string[] }) {
  const result = await reorderChildren(entryId, input, tenantSlug);
  refresh();
  return result;
}

export async function deleteAssetAction(tenantSlug: string, assetId: string) {
  const result = await deleteAsset(assetId, tenantSlug);
  refresh();
  return result;
}

export async function updateAssetAction(tenantSlug: string, assetId: string, input: { originalName: string }) {
  const result = await updateAsset(assetId, input, tenantSlug);
  refresh();
  return result;
}

export async function presignUploadAction(tenantSlug: string, input: { filename: string; mimeType: string; fileSize: number }) {
  return presignAssetUpload(input, tenantSlug);
}

export async function completeUploadAction(tenantSlug: string, input: { uploadToken: string; etag?: string }) {
  const result = await completeAssetUpload(input, tenantSlug);
  refresh();
  return result;
}
