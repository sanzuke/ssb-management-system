-- Menyiapkan role dan pemilik database untuk pengembangan lokal, Docker Compose, dan CI.
-- Dijalankan sekali oleh superuser terhadap database `ssb` yang sudah ada.
-- Kata sandi di sini HANYA untuk pengembangan dan CI. Produksi memakai kata sandi sendiri.
CREATE ROLE ssb_owner LOGIN CREATEROLE PASSWORD 'owner';
CREATE ROLE ssb_app LOGIN PASSWORD 'app';
ALTER DATABASE ssb OWNER TO ssb_owner;
GRANT CREATE ON SCHEMA public TO ssb_owner;
