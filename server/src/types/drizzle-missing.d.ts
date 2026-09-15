/**
 * Drizzle MSSEL modulleri icin module declarations.
 *
 * drizzle-orm@0.36.4 npm package'inda 'mssql-core' ve 'node-mssql'
 * exports map'te yer almiyor (TypeScript moduleResolution ile bulunamiyor).
 * Ama runtime'da `import('drizzle-orm/mssql-core')` calisiyor — node module
 * loader TypeScript exports map'e bakmaz.
 *
 * Bu declaration TypeScript'i susturur (TS2307 'Cannot find module' hatasini),
 * runtime davranisi degismez. Schema dosyalari runtime'da dogru calisir.
 *
 * Uzun vadede Drizzle ekibi MSSEL exports'unu ekleyince bu dosya silinebilir.
 */
declare module 'drizzle-orm/mssql-core';
declare module 'drizzle-orm/node-mssql';