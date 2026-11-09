const bcrypt = require('bcrypt');
const pool = require('./db');

async function seed() {
  // Clear old data (children first, because of foreign keys)
  await pool.query('DELETE FROM bookings');
  await pool.query('DELETE FROM resources');
  await pool.query('DELETE FROM users');

  // Demo users (demo passwords only, never real ones)
  const adminHash = await bcrypt.hash('AdminDemo123!', 10);
  const memberHash = await bcrypt.hash('MemberDemo123!', 10);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES
     ('Lab Admin', 'admin@bookit.demo', $1, 'admin'),
     ('Demo Member', 'member@bookit.demo', $2, 'member')`,
    [adminHash, memberHash]
  );

  // Lab equipment
  await pool.query(
    `INSERT INTO resources
       (name, description, category, max_booking_minutes, available_from, available_to)
     VALUES
     ('3D Printer', 'Prusa FDM printer for prototypes', 'Equipment', 240, '09:00', '17:00'),
     ('VR Headset 1', 'Meta Quest for VR experiments', 'Equipment', 120, '09:00', '17:00'),
     ('VR Headset 2', 'Meta Quest for VR experiments', 'Equipment', 120, '09:00', '17:00'),
     ('Meeting Room', 'Small room, seats 6', 'Room', 180, '08:00', '20:00')`
  );

  console.log('Seed complete.');
  console.log('Admin:  admin@bookit.demo  / AdminDemo123!');
  console.log('Member: member@bookit.demo / MemberDemo123!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});