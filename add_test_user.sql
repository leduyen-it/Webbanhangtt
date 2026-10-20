-- Thêm user test với email leduyenltbn@gmail.com
-- Password: 123456 (bcrypt hashed)

INSERT INTO `user` (`idUser`, `ho`, `ten`, `email`, `username`, `password`, `role`, `phone`, `address`) 
VALUES (10, 'Lê', 'Duyên', 'leduyenltbn@gmail.com', 'leduyen', '$2b$10$G9h2/PaYR0v6n5Kjl4oKcOxPwqPTf.1x9/CzDJ1F5Oz6c8J8T6i/a', 'admin', NULL, NULL);

-- Thêm user test với email duyenmythile13102004@gmail.com
INSERT INTO `user` (`idUser`, `ho`, `ten`, `email`, `username`, `password`, `role`, `phone`, `address`) 
VALUES (11, 'Duyên', 'My', 'duyenmythile13102004@gmail.com', 'duyenmy', '$2b$10$G9h2/PaYR0v6n5Kjl4oKcOxPwqPTf.1x9/CzDJ1F5Oz6c8J8T6i/a', 'customer', NULL, NULL);
