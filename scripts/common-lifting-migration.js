export async function migrateCommonLifting(connection,preflight=false) {
 const [tables]=await connection.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='paddy_liftings'");
 if(!tables.length)return;
 const [invalid]=await connection.query("SELECT l.id FROM paddy_liftings l LEFT JOIN shipments s ON s.id=l.shipment_id JOIN paddy_release_orders ro ON ro.id=l.release_order_id WHERE s.id IS NULL OR s.leg<>'PADDY' OR s.source_id<>ro.source_id OR s.destination_id<>ro.destination_id OR s.season_id<>ro.season_id OR s.quantity_g<>l.quantity_g LIMIT 1");
 if(invalid.length)throw new Error('Legacy paddy lifting '+invalid[0].id+' has no matching shipment. Resolve it before common lifting migration. Legacy data has been preserved.');
 if(preflight)return;
 await connection.query('UPDATE shipments s JOIN paddy_liftings l ON l.shipment_id=s.id SET s.release_order_id=l.release_order_id WHERE s.release_order_id IS NULL');
 console.log('Legacy paddy lifting RO links copied to shipments. Legacy table retained as an archive.');
}

export async function removeLegacyLiftingTable(connection) {
 const [tables]=await connection.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='paddy_liftings'");
 if(!tables.length)return;
 await migrateCommonLifting(connection);
 const [unmigrated]=await connection.query("SELECT l.id FROM paddy_liftings l LEFT JOIN shipments s ON s.id=l.shipment_id WHERE s.id IS NULL OR NOT(s.release_order_id <=> l.release_order_id) OR NOT(s.dispatch_receipt <=> l.receipt_no) OR NOT(s.dispatched_at <=> l.lifted_at) OR NOT(s.driver_name <=> l.driver_name) OR NOT(s.driver_phone <=> l.driver_phone) LIMIT 1");
 if(unmigrated.length)throw new Error('Legacy paddy lifting '+unmigrated[0].id+' is not fully represented in shipments. Table removal stopped.');
 await connection.query('DROP TABLE paddy_liftings');
 console.log('Removed paddy_liftings after verifying shipment RO, quantity and dispatch details.');
}
