-- The company is now Axios Equipment Care. Its name goes out in invitation and
-- password-reset emails, so the stored name changes with the brand.
-- Only the company created at setup is renamed, and only if it still carries
-- the old name, so this is safe to run on any copy of the database.
UPDATE "ServiceCompany" SET "name" = 'Axios Equipment Care' WHERE "slug" = 'clearline' AND "name" = 'Clearline Equipment Care';
