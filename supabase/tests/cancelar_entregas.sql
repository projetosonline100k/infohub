-- Cancelado é aceito nas edições e nos carrosséis.
BEGIN;
DO $$
BEGIN
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'edicoes_video_status_check')) NOT LIKE '%cancelado%' THEN
    RAISE EXCEPTION 'edicoes_video não aceita cancelado';
  END IF;
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'carrosseis_status_check')) NOT LIKE '%cancelado%' THEN
    RAISE EXCEPTION 'carrosseis não aceita cancelado';
  END IF;
END $$;
ROLLBACK;
