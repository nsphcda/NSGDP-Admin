import { apiClient } from './client';

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  timestamp: string;
  path: string;
  data: T;
}

// Mirrors nsgdp-backend src/modules/admin/constants/permission-actions.ts
export type PermissionActionKey =
  | 'approve:datasets'      // Approver tier: final sign-off on a validated dataset, or send it back to under_review
  | 'validate:datasets'     // Validator tier: QA checklist, mark under review, reject, request revision, mark validated
  | 'publish:datasets'
  | 'archive:datasets'
  | 'view:datasets'         // Read-only: see the review queue without approving/publishing/archiving
  | 'invite:users'          // Split from manage:users
  | 'invite:staff'          // Invite/manage agency staff invites and view the staff roster
  | 'promote:org-admin'     // Split from manage:users - powerful, delegatable
  | 'demote:org-admin'      // Counterpart to promote:org-admin - powerful, delegatable
  | 'remove:org-members'    // Detach a member from their development partner
  | 'view:restricted'
  | 'download:restricted'
  | 'create:programs'
  | 'edit:programs'
  | 'delete:programs'
  | 'upload:programs'
  | 'approve:access-requests'
  | 'view:access-requests'
  | 'view:partner-interest'
  | 'review:partner-interest'
  | 'view:contact-messages'
  | 'review:contact-messages'
  | 'create:development-partners'
  | 'edit:development-partners'
  | 'deactivate:development-partners'
  | 'delete:development-partners'
  | 'manage:development-partner-agreements'
  | 'create:datasets'
  | 'manage:documents'
  | 'manage:groups'
  | 'manage:analytics'
  | 'manage:gis-reference-data'
  | 'manage:indicators'
  | 'manage:learning'
  | 'manage:department-members'; // Scoped: view/add/remove existing staff in the holder's own department(s)

export interface PermissionGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  member_count: number;
  grant_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PermissionGroupMember {
  id: string;
  user_id: string;
  added_by: string | null;
  joined_at: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

export interface PermissionGrant {
  id: string;
  group_id: string;
  action: string;
  resource_type: string;
  permission_key: PermissionActionKey | null;
  is_granted: boolean;
  expires_at: string | null;
  granted_by: string;
  created_at: string;
}

export interface PermissionGroupDetail extends PermissionGroup {
  members: PermissionGroupMember[];
  grants: PermissionGrant[];
}

export interface PermissionMatrix {
  actions: Array<{ key: PermissionActionKey; minimumRole: string; resourceType: string; action: string }>;
  // Every active permission group and its currently-granted actions — groups
  // can only ever have staff members, so this is the real matrix. super_admin
  // isn't included: it always has every permission and isn't a group.
  delegations: Array<{ id: string; name: string; slug: string; actions: PermissionActionKey[] }>;
}

export interface CreatePermissionGroupPayload {
  name: string;
  description?: string;
}

export interface UpdatePermissionGroupPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export async function getPermissionGroups(): Promise<PermissionGroup[]> {
  const response = await apiClient.get<ApiResponse<PermissionGroup[]>>('/admin/permission-groups');
  return response.data.data;
}

export async function getPermissionGroup(id: string): Promise<PermissionGroupDetail> {
  const response = await apiClient.get<ApiResponse<PermissionGroupDetail>>(`/admin/permission-groups/${id}`);
  return response.data.data;
}

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const response = await apiClient.get<ApiResponse<PermissionMatrix>>('/admin/permission-groups/matrix');
  return response.data.data;
}

export async function createPermissionGroup(payload: CreatePermissionGroupPayload): Promise<PermissionGroup> {
  const response = await apiClient.post<ApiResponse<PermissionGroup>>('/admin/permission-groups', payload);
  return response.data.data;
}

export async function updatePermissionGroup(id: string, payload: UpdatePermissionGroupPayload): Promise<PermissionGroup> {
  const response = await apiClient.patch<ApiResponse<PermissionGroup>>(`/admin/permission-groups/${id}`, payload);
  return response.data.data;
}

export async function deactivatePermissionGroup(id: string): Promise<PermissionGroup> {
  const response = await apiClient.patch<ApiResponse<PermissionGroup>>(
    `/admin/permission-groups/${id}/deactivate`
  );
  return response.data.data;
}

export async function deletePermissionGroup(id: string): Promise<void> {
  await apiClient.delete(`/admin/permission-groups/${id}`);
}

export async function addGroupMember(groupId: string, userId: string): Promise<PermissionGroupMember> {
  const response = await apiClient.post<ApiResponse<PermissionGroupMember>>(
    `/admin/permission-groups/${groupId}/members`,
    { userId }
  );
  return response.data.data;
}

export interface GroupMemberAssignment {
  membership: {
    id: string;
    user_id: string;
    group_id: string;
    joined_at: string;
  };
  source: { id: string } | null;
  target: { id: string; name: string; slug: string };
}

export async function assignGroupMember(
  targetGroupId: string,
  userId: string,
  expectedCurrentGroupId: string | null
): Promise<GroupMemberAssignment> {
  const response = await apiClient.put<ApiResponse<GroupMemberAssignment>>(
    `/admin/permission-groups/${targetGroupId}/members/${userId}`,
    { expectedCurrentGroupId }
  );
  return response.data.data;
}

export async function grantPermission(
  groupId: string,
  action: PermissionActionKey,
  expiresAt?: string
): Promise<PermissionGrant> {
  const response = await apiClient.post<ApiResponse<PermissionGrant>>(
    `/admin/permission-groups/${groupId}/grants`,
    { action, expiresAt }
  );
  return response.data.data;
}

export async function revokePermission(groupId: string, grantId: string): Promise<void> {
  await apiClient.delete(`/admin/permission-groups/${groupId}/grants/${grantId}`);
}

/**
 * Get the current user's delegated permissions
 * Returns the list of permission action keys the user has access to
 */
export async function getUserPermissions(): Promise<PermissionActionKey[]> {
  // Matches PermissionsController's actual @Controller('admin/permission-groups')
  // base path — 'admin/permissions/me' was never a registered route (404).
  const response = await apiClient.get<ApiResponse<PermissionActionKey[]>>('/admin/permission-groups/me');
  return response.data.data;
}
