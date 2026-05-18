import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { userAddresses } from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import type { CreateAddressInput, UpdateAddressInput } from '../validators/address.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const MAX_ADDRESSES = 2;

interface AddressRow {
  id: string;
  label: string;
  streetEn: string;
  streetAr: string;
  districtEn: string;
  districtAr: string;
  cityEn: string;
  cityAr: string;
  postalCode: string | null;
  lat: string; // Drizzle returns numeric as string
  lng: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface AddressResponse {
  id: string;
  label: string;
  streetEn: string;
  streetAr: string;
  districtEn: string;
  districtAr: string;
  cityEn: string;
  cityAr: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
}

const ADDRESS_FIELDS = {
  id: userAddresses.id,
  label: userAddresses.label,
  streetEn: userAddresses.streetEn,
  streetAr: userAddresses.streetAr,
  districtEn: userAddresses.districtEn,
  districtAr: userAddresses.districtAr,
  cityEn: userAddresses.cityEn,
  cityAr: userAddresses.cityAr,
  postalCode: userAddresses.postalCode,
  lat: userAddresses.lat,
  lng: userAddresses.lng,
  isDefault: userAddresses.isDefault,
  createdAt: userAddresses.createdAt,
} as const;

function toResponse(row: AddressRow): AddressResponse {
  return {
    id: row.id,
    label: row.label,
    streetEn: row.streetEn,
    streetAr: row.streetAr,
    districtEn: row.districtEn,
    districtAr: row.districtAr,
    cityEn: row.cityEn,
    cityAr: row.cityAr,
    postalCode: row.postalCode,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

export class AddressService {
  constructor(private db: Db) {}

  /** R1.AC1, R1.AC2, R1.AC3: List all addresses for a user */
  async list(userId: string): Promise<AddressResponse[]> {
    const rows = await this.db.select(ADDRESS_FIELDS).from(userAddresses).where(eq(userAddresses.userId, userId));

    return rows.map((r) => toResponse(r as unknown as AddressRow));
  }

  /** R2.AC1, R2.AC5, R2.AC6, R2.AC7: Create a new address */
  async create(userId: string, data: CreateAddressInput): Promise<AddressResponse> {
    // R2.AC5: Check 2-address limit
    const existing = await this.db
      .select({ id: userAddresses.id, label: userAddresses.label })
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId));

    if (existing.length >= MAX_ADDRESSES) {
      throw new AppError('Maximum of 2 addresses allowed', 'MAX_ADDRESSES_REACHED', 409);
    }

    // R2.AC6: Check label uniqueness
    if (existing.some((a) => a.label === data.label)) {
      throw new AppError(`An address with label "${data.label}" already exists`, 'LABEL_ALREADY_EXISTS', 409);
    }

    // R2.AC7: Auto-set isDefault if first address
    const isDefault = existing.length === 0;

    const [row] = await this.db
      .insert(userAddresses)
      .values({
        userId,
        label: data.label,
        streetEn: data.streetEn,
        streetAr: data.streetAr,
        districtEn: data.districtEn,
        districtAr: data.districtAr,
        cityEn: data.cityEn,
        cityAr: data.cityAr,
        postalCode: data.postalCode ?? null,
        lat: data.lat.toString(),
        lng: data.lng.toString(),
        isDefault,
      })
      .returning(ADDRESS_FIELDS);

    return toResponse(row as unknown as AddressRow);
  }

  /** R3.AC1, R3.AC2, R3.AC3: Update an existing address */
  async update(userId: string, id: string, data: UpdateAddressInput): Promise<AddressResponse> {
    // R3.AC2: Verify ownership
    const [existing] = await this.db
      .select(ADDRESS_FIELDS)
      .from(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError('Address not found', 'ADDRESS_NOT_FOUND', 404);
    }

    // R3.AC3: Check label conflict if changing label
    if (data.label && data.label !== existing.label) {
      const conflict = await this.db
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(and(eq(userAddresses.userId, userId), eq(userAddresses.label, data.label)))
        .limit(1);

      if (conflict.length > 0) {
        throw new AppError(`An address with label "${data.label}" already exists`, 'LABEL_ALREADY_EXISTS', 409);
      }
    }

    // Build update object — only include provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.label !== undefined) updates['label'] = data.label;
    if (data.streetEn !== undefined) updates['streetEn'] = data.streetEn;
    if (data.streetAr !== undefined) updates['streetAr'] = data.streetAr;
    if (data.districtEn !== undefined) updates['districtEn'] = data.districtEn;
    if (data.districtAr !== undefined) updates['districtAr'] = data.districtAr;
    if (data.cityEn !== undefined) updates['cityEn'] = data.cityEn;
    if (data.cityAr !== undefined) updates['cityAr'] = data.cityAr;
    if (data.postalCode !== undefined) updates['postalCode'] = data.postalCode;
    if (data.lat !== undefined) updates['lat'] = data.lat.toString();
    if (data.lng !== undefined) updates['lng'] = data.lng.toString();

    const [row] = await this.db
      .update(userAddresses)
      .set(updates)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .returning(ADDRESS_FIELDS);

    return toResponse(row as unknown as AddressRow);
  }

  /** R4.AC1, R4.AC2, R4.AC3: Delete an address */
  async remove(userId: string, id: string): Promise<void> {
    // R4.AC2: Verify ownership
    const [existing] = await this.db
      .select({ id: userAddresses.id, isDefault: userAddresses.isDefault })
      .from(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError('Address not found', 'ADDRESS_NOT_FOUND', 404);
    }

    await this.db.delete(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));

    // R4.AC3: Auto-promote remaining address to default if deleted was default
    if (existing.isDefault) {
      const remaining = await this.db
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(eq(userAddresses.userId, userId))
        .limit(1);

      if (remaining.length > 0) {
        await this.db
          .update(userAddresses)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(userAddresses.id, remaining[0]!.id));
      }
    }
  }

  /** R5.AC1, R5.AC2, R5.AC3: Set an address as default */
  async setDefault(userId: string, id: string): Promise<AddressResponse> {
    // R5.AC3: Verify ownership
    const [existing] = await this.db
      .select({ id: userAddresses.id })
      .from(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError('Address not found', 'ADDRESS_NOT_FOUND', 404);
    }

    // R5.AC1: Unset all defaults for this user, then set the target
    await this.db
      .update(userAddresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(userAddresses.userId, userId));

    const [row] = await this.db
      .update(userAddresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .returning(ADDRESS_FIELDS);

    return toResponse(row as unknown as AddressRow);
  }
}
