import 'dotenv/config';
import { getDb } from '../rag/store.js';
import { normalizePhone } from './records.js';

const isApply = process.argv.includes('--apply');

interface RawContact {
  _id: any;
  callerId: string;
  name: string;
  nameKey?: string;
  relation?: string;
  phone?: string;
  email?: string;
  schemaVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

function completenessScore(c: RawContact): number {
  let score = 0;
  if (c.phone) score += 3;
  if (c.email) score += 3;
  if (c.relation) score += 2;
  if (c.updatedAt) score += 1;
  return score;
}

async function backfillContacts() {
  const db = await getDb();
  const col = db.collection<RawContact>('caller_contacts');

  console.log(`\n=== Contacts Backfill (${isApply ? 'APPLY MODE' : 'DRY-RUN MODE'}) ===`);
  if (!isApply) {
    console.log('NOTE: Dry-run only. No database modifications will be performed.');
    console.log('To apply changes, run: tsx memory/backfill-contacts.ts --apply\n');
  }

  const all = await col.find().toArray();
  console.log(`Found ${all.length} contact document(s) in caller_contacts.`);

  // Group by callerId + nameKey
  const groups = new Map<string, RawContact[]>();
  for (const doc of all) {
    const key = `${doc.callerId}:${(doc.name || '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  let updatedCount = 0;
  let dedupedCount = 0;

  for (const [key, docs] of groups.entries()) {
    const [callerId, nameKey] = key.split(':');
    console.log(`\nGroup: callerId="${callerId.slice(0, 8)}...", nameKey="${nameKey}" (${docs.length} doc(s))`);

    if (docs.length === 1) {
      const doc = docs[0];
      const needsNameKey = doc.nameKey !== nameKey;
      const needsVersion = doc.schemaVersion !== 1;
      const normPhone = normalizePhone(doc.phone);
      const needsPhoneNorm = doc.phone && normPhone && doc.phone !== normPhone;

      if (needsNameKey || needsVersion || needsPhoneNorm) {
        console.log(`  -> Update doc ${doc._id}: nameKey="${nameKey}", schemaVersion=1${needsPhoneNorm ? `, phone="${normPhone}"` : ''}`);
        if (isApply) {
          const updateSet: Record<string, any> = {
            nameKey,
            schemaVersion: 1,
            updatedAt: new Date(),
          };
          if (normPhone) updateSet.phone = normPhone;
          await col.updateOne({ _id: doc._id }, { $set: updateSet });
        }
        updatedCount++;
      } else {
        console.log(`  -> Doc ${doc._id} is already up to date.`);
      }
    } else {
      // Multiple docs for same nameKey -> deduplicate, keeping the most complete doc
      console.log(`  -> Found ${docs.length} duplicates for "${nameKey}". Deduplicating...`);
      docs.sort((a, b) => completenessScore(b) - completenessScore(a));
      const best = docs[0];
      const duplicates = docs.slice(1);

      // Merge missing fields from duplicates into best
      let mergedRelation = best.relation;
      let mergedPhone = normalizePhone(best.phone);
      let mergedEmail = best.email;

      for (const dup of duplicates) {
        if (!mergedRelation && dup.relation) mergedRelation = dup.relation;
        if (!mergedPhone && dup.phone) mergedPhone = normalizePhone(dup.phone);
        if (!mergedEmail && dup.email) mergedEmail = dup.email;
      }

      console.log(`  -> Keeping primary doc ${best._id} with merged fields:`, {
        name: best.name,
        nameKey,
        relation: mergedRelation,
        phone: mergedPhone,
        email: mergedEmail,
      });

      for (const dup of duplicates) {
        console.log(`  -> Deleting duplicate doc ${dup._id}`);
      }

      if (isApply) {
        // Update primary
        await col.updateOne(
          { _id: best._id },
          {
            $set: {
              nameKey,
              schemaVersion: 1,
              ...(mergedRelation ? { relation: mergedRelation } : {}),
              ...(mergedPhone ? { phone: mergedPhone } : {}),
              ...(mergedEmail ? { email: mergedEmail } : {}),
              updatedAt: new Date(),
            },
          },
        );

        // Remove duplicates
        const dupIds = duplicates.map((d) => d._id);
        await col.deleteMany({ _id: { $in: dupIds } } as any);
      }

      updatedCount++;
      dedupedCount += duplicates.length;
    }
  }

  if (isApply) {
    console.log(`\nBackfill applied successfully. Updated: ${updatedCount}, Duplicates removed: ${dedupedCount}`);
  } else {
    console.log(`\nDry run completed. ${updatedCount} document(s) would be updated, ${dedupedCount} duplicates removed.`);
    console.log('Run with --apply to commit changes.');
  }

  process.exit(0);
}

backfillContacts().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
