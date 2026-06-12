-- ════════════════════════════════════════════════════════════
--  FOTO DE PACIENTES + MEJORAS MEMBRESÍAS
-- ════════════════════════════════════════════════════════════

-- ── 1. Agregar foto_url a pacientes ──────────────────────
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- ── 2. Número de carnet en membresías ────────────────────
ALTER TABLE membresias ADD COLUMN IF NOT EXISTS numero_carnet VARCHAR(20);

-- Rellenar membresías existentes sin carnet
UPDATE membresias
SET numero_carnet = LPAD(id::text, 6, '0')
WHERE numero_carnet IS NULL;

-- ── 3. Bucket de almacenamiento para fotos ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('pacientes-fotos', 'pacientes-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Policies de storage (sin IF NOT EXISTS) ───────────
DROP POLICY IF EXISTS "auth_upload_fotos"  ON storage.objects;
DROP POLICY IF EXISTS "auth_update_fotos"  ON storage.objects;
DROP POLICY IF EXISTS "public_read_fotos"  ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_fotos"  ON storage.objects;

CREATE POLICY "auth_upload_fotos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pacientes-fotos');

CREATE POLICY "auth_update_fotos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pacientes-fotos');

CREATE POLICY "public_read_fotos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'pacientes-fotos');

CREATE POLICY "auth_delete_fotos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pacientes-fotos');
