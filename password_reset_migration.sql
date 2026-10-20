CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `idUser` int(11) NOT NULL,
  `otpHash` char(64) DEFAULT NULL,
  `otpExpiresAt` datetime DEFAULT NULL,
  `otpAttempts` tinyint unsigned NOT NULL DEFAULT 0,
  `sendCount` tinyint unsigned NOT NULL DEFAULT 0,
  `windowStartedAt` datetime DEFAULT NULL,
  `lastSentAt` datetime DEFAULT NULL,
  `verifiedTokenHash` char(64) DEFAULT NULL,
  `verifiedExpiresAt` datetime DEFAULT NULL,
  `usedAt` datetime DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`idUser`),
  CONSTRAINT `fk_password_reset_tokens_user`
    FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
