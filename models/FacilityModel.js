const DbConn = require("../helper/DbTransaction");

const FacilityModel = {
  getAllFacilities: async () => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const query = `SELECT id_fasilitas, nama FROM mst_fas ORDER BY nama`;
      const result = await client.query(query);
      return result[0];
    } finally {
      client.release();
    }
  },

  updateRoomFacilities: async (id_ruangan, newFacilityIds) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      console.log('updateRoomFacilities called with:', { id_ruangan, newFacilityIds });

      // Get current facilities for this room
      const currentFacilities = await client.query(
        `SELECT id_fasilitas FROM fas_room WHERE id_ruangan = ?`,
        [id_ruangan]
      );
      
      const currentFacilityIds = currentFacilities[0].map(row => row.id_fasilitas);
      const newFacilityIdsSet = new Set(newFacilityIds || []);
      const currentFacilityIdsSet = new Set(currentFacilityIds);

      console.log('Current facility IDs:', currentFacilityIds);
      console.log('New facility IDs:', newFacilityIds);

      // Find facilities to add (in new but not in current)
      const facilitiesToAdd = newFacilityIds.filter(id => !currentFacilityIdsSet.has(id));
      
      // Find facilities to remove (in current but not in new)
      const facilitiesToRemove = currentFacilityIds.filter(id => !newFacilityIdsSet.has(id));

      console.log('Facilities to add:', facilitiesToAdd);
      console.log('Facilities to remove:', facilitiesToRemove);

      // Remove facilities that are no longer selected
      if (facilitiesToRemove.length > 0) {
        const removePlaceholders = facilitiesToRemove.map(() => '?').join(', ');
        await client.query(
          `DELETE FROM fas_room WHERE id_ruangan = ? AND id_fasilitas IN (${removePlaceholders})`,
          [id_ruangan, ...facilitiesToRemove]
        );
      }

      // Add new facilities
      if (facilitiesToAdd.length > 0) {
        const addValues = facilitiesToAdd.map(facilityId => [id_ruangan, facilityId]);
        const addPlaceholders = addValues.map(() => '(?, ?)').join(', ');
        const flatAddValues = addValues.flat();
        
        await client.query(
          `INSERT INTO fas_room (id_ruangan, id_fasilitas) VALUES ${addPlaceholders}`,
          flatAddValues
        );
      }

      await client.commit();
      return { 
        success: true, 
        added: facilitiesToAdd.length,
        removed: facilitiesToRemove.length
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getRoomFacilities: async (id_ruangan) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const query = `
        SELECT mf.id_fasilitas, mf.nama 
        FROM fas_room fr 
        LEFT JOIN mst_fas mf ON fr.id_fasilitas = mf.id_fasilitas 
        WHERE fr.id_ruangan = ?
        ORDER BY mf.nama
      `;
      const result = await client.query(query, [id_ruangan]);
      return result[0];
    } finally {
      client.release();
    }
  },
};

module.exports = FacilityModel;