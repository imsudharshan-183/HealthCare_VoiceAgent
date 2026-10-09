import 'dotenv/config';
import { getDb } from '../rag/store.js';

const isApply = process.argv.includes('--apply');

async function migrateCaregivers() {
  const db = await getDb();
  const profilesCol = db.collection('caller_profiles');
  const contactsCol = db.collection('caller_contacts');

  console.log(`\n=== Caregiver Migration (${isApply ? 'APPLY MODE' : 'DRY-RUN MODE'}) ===`);
  if (!isApply) {
    console.log('NOTE: Dry-run only. No database modifications will be performed.');
    console.log('To apply changes, run: tsx memory/migrate-caregivers.ts --apply\n');
  }

  // Find all profiles with caregiverName
  const docs = await profilesCol
    .find({
      $or: [
        { caregiverName: { $exists: true, $ne: '' } },
        { caregiverRelation: { $exists: true, $ne: '' } },
      ],
    })
    .toArray();

  console.log(`Found ${docs.length} profile document(s) with legacy caregiver fields.`);

  if (docs.length === 0) {
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const doc of docs) {
    const callerId = doc.callerId as string;
    const caregiverName = (doc.caregiverName as string)?.trim();
    const caregiverRelation = (doc.caregiverRelation as string)?.trim();

    console.log(`\nCaller: ${callerId}`);
    console.log(`  Current legacy fields: caregiverName="${caregiverName ?? ''}", caregiverRelation="${caregiverRelation ?? ''}"`);

    if (caregiverName) {
      console.log(`  -> Action: Migrate to caller_contacts: { name: "${caregiverName}", relation: "${caregiverRelation ?? ''}" }`);
      console.log('  -> Action: $unset caregiverName and caregiverRelation on caller_profiles');

      if (isApply) {
        const now = new Date();
        // Upsert into caller_contacts
        await contactsCol.updateOne(
          { callerId, name: caregiverName },
          {
            $set: {
              callerId,
              name: caregiverName,
              ...(caregiverRelation ? { relation: caregiverRelation } : {}),
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true },
        );

        // Unset from caller_profiles
        await profilesCol.updateOne(
          { _id: doc._id },
          { $unset: { caregiverName: '', caregiverRelation: '' } },
        );
        migratedCount++;
      }
    } else {
      console.log('  -> Action: No caregiverName found, only caregiverRelation. $unset caregiverRelation.');
      if (isApply) {
        await profilesCol.updateOne(
          { _id: doc._id },
          { $unset: { caregiverName: '', caregiverRelation: '' } },
        );
        skippedCount++;
      }
    }
  }

  if (isApply) {
    console.log(`\nMigration completed successfully. Migrated: ${migratedCount}, Cleaned: ${skippedCount}`);
  } else {
    console.log(`\nDry run completed. ${docs.length} document(s) would be affected. Run with --apply to execute.`);
  }

  process.exit(0);
}

migrateCaregivers().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
