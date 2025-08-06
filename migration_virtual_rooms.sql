-- Migration script to add virtual room support with Zoom links
-- Run this script against your MySQL database

-- Step 1: Add new columns to mst_room table
ALTER TABLE mst_room 
ADD COLUMN is_virtual ENUM('T', 'F') NOT NULL DEFAULT 'F' COMMENT 'Indicates if the room is virtual (T) or physical (F)',
ADD COLUMN zoom_link VARCHAR(500) NULL COMMENT 'Zoom meeting link for virtual rooms',
ADD COLUMN zoom_meeting_id VARCHAR(100) NULL COMMENT 'Zoom meeting ID for virtual rooms',
ADD COLUMN zoom_passcode VARCHAR(50) NULL COMMENT 'Zoom meeting passcode for virtual rooms';

-- Step 2: Add index for better query performance when filtering virtual rooms
CREATE INDEX idx_mst_room_is_virtual ON mst_room(is_virtual);

-- Step 3: Add a compound index for filtering active virtual rooms
CREATE INDEX idx_mst_room_virtual_active ON mst_room(is_virtual, is_active);

-- Step 4: Insert sample virtual room data (optional - remove if not needed)
-- INSERT INTO mst_room (id_ruangan, nama, kapasitas, lokasi, category, image, is_active, is_virtual, zoom_link, zoom_meeting_id, zoom_passcode)
-- VALUES 
-- ('VROOM001', 'Virtual Conference Room 1', 50, 'Online', 1, 'virtual_room_default.jpg', 'T', 'T', 'https://zoom.us/j/1234567890', '1234567890', 'sample123'),
-- ('VROOM002', 'Virtual Meeting Room 2', 20, 'Online', 1, 'virtual_room_default.jpg', 'T', 'T', 'https://zoom.us/j/0987654321', '0987654321', 'meet456');

-- Step 5: Verify the changes
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT, 
    COLUMN_COMMENT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'mst_room' 
    AND TABLE_SCHEMA = DATABASE()
ORDER BY ORDINAL_POSITION;