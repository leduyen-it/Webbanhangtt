ALTER TABLE `comment`
  ADD COLUMN `idUser` INT NULL DEFAULT NULL AFTER `idComment`,
  ADD KEY `idx_comment_user_product` (`idUser`, `idProduct`),
  ADD CONSTRAINT `fk_comment_user`
    FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`)
    ON DELETE SET NULL ON UPDATE CASCADE;
