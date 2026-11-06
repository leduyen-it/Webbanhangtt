CREATE TABLE IF NOT EXISTS `contact_messages` (
  `idMessage` int(11) NOT NULL AUTO_INCREMENT,
  `senderName` varchar(100) NOT NULL,
  `senderEmail` varchar(254) NOT NULL,
  `subject` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`idMessage`),
  KEY `idx_contact_messages_unread` (`isRead`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
