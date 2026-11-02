# Small Works store release

The public repository is `tellop-ai/small-works`. The listing is `small-works`, named **Small Works** in English and Turkish. Both versions are free. No account, ads, purchases, or paid features are required.

- `small-works.json` is the metadata entered on Tellop’s Store admin page.
- `small-works.pictures.json` seeds a disposable workshop through its public API and captures the workshop, active focus, and task list in both languages. The example tasks are invented and are never included in an installed workshop.
- The approved icon is `public/store-picture.webp`; its source and encoding record are in `plans/brand/candidates/small-works/`.
- The app uses the qualified next-sqlite kit 2.1.19. `lib/kit-release.json` records the version derived by Tellop’s exporter.

The development branch retains design records. The default branch ships the screened portable export without development plans. Keep the original README’s free-use instructions, the full Three.js credit in NOTICE, and local-data exclusions when preparing that export. Never include saved workshop records.

The listing includes the approved icon and three screenshots per language. `store-pictures-record.json` records their source version, dimensions and digests.

## Initial publication 2026-11-02

- Release: 0.1.0.
- Public default-branch commit: `3f0e2d6b11a05cbe0e4cae7045494f5820ccef97`.
- Store check: passed every check; app kit 2.1.19, checked against the accepted 2.1.18–2.1.22 package family.
- Kept archive: `2effaa7aa2c1194519a420d9ef17fe2c553286d902b8ea04b8d43801a60b3173`, 629,228 bytes.
- Signed listing: version 47, published 2026-11-02 at 08:56 UTC.
- Public page: https://tellop.ai/en/apps/small-works
- Turkish page: https://tellop.ai/tr/uygulamalar/small-works
- Approved icon: 7,848-byte WebP, visible on the public page.
- No internet, file, or device permission; no sample records.

Verification: the exporter passed and the production admin passed and published the exact GitHub commit. The public page shows Small Works, Free, English, Türkçe, 0.1.0 and Open source with the correct icon. No app logic changed in this release. The previously completed gameplay tests and contained build were not repeated for this packaging-only change.

## Screenshot update 2026-11-02

- Public commit: `faa538021014de957cd91aa444b5f1bc14661262`. Only the six screenshot files changed.
- Signed listing: version 48, published 2026-11-02 at 10:33 UTC. Release label remains 0.1.0.
- Kept archive: `14b512f82b34845baeac807760f749b6eb5acf5e91ce0f15e8cd09d3f08ce0bf`, 1,458,440 bytes.
- Six metadata-free 2560 × 1600 WebP images, three in English and three in Turkish, each below 256 KiB.
- Views: workshop and focus setup, an active session linked to a real-world task, and the task list with its workshop work queue.
- Each language built and ran through the contained app host using the qualified 2.1.19 dependency set. Disposable records were created through the app’s API. No personal save was read or changed.
- The initial attempt was retaken to keep the full header visible and select the focus task through its task-row button. All six final images were reviewed on the contact sheet.
- The portable export and production store check passed. Both public pages expose their three-image galleries.
