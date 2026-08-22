-- AlterEnum (DEV value added in 20260817130000_add_dev_role; safe no-op if already present)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEV';

