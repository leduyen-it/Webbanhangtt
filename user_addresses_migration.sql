CREATE TABLE IF NOT EXISTS `user_addresses` (
  `idAddress` int(11) NOT NULL AUTO_INCREMENT,
  `idUser` int(11) NOT NULL,
  `fullName` varchar(100) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `province` varchar(50) NOT NULL,
  `district` varchar(50) NOT NULL,
  `ward` varchar(50) NOT NULL,
  `detailAddress` text NOT NULL,
  `addressType` enum('home','office','other') DEFAULT 'home',
  `isDefault` tinyint(1) DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`idAddress`),
  KEY `idUser` (`idUser`),
  CONSTRAINT `user_addresses_ibfk_1`
    FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `user_addresses`
  (`idUser`, `fullName`, `phone`, `province`, `district`, `ward`, `detailAddress`, `addressType`, `isDefault`)
SELECT
  `u`.`idUser`,
  LEFT(TRIM(CONCAT_WS(' ', `u`.`ho`, `u`.`ten`)), 100),
  LEFT(TRIM(CAST(`u`.`phone` AS CHAR)), 15),
  '',
  '',
  '',
  `u`.`address`,
  'home',
  1
FROM `user` AS `u`
WHERE TRIM(COALESCE(`u`.`address`, '')) <> ''
  AND TRIM(CAST(COALESCE(`u`.`phone`, '') AS CHAR)) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `user_addresses` AS `a`
    WHERE `a`.`idUser` = `u`.`idUser`
  );
