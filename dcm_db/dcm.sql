-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 04-03-2026 a las 20:34:27
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `dcm`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `conexiones`
--

CREATE TABLE `conexiones` (
  `id` varchar(100) NOT NULL,
  `equipo_id` varchar(100) NOT NULL,
  `tipo` varchar(50) NOT NULL DEFAULT '',
  `estado` varchar(20) NOT NULL DEFAULT 'Inactivo',
  `destino` varchar(150) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `equipos`
--

CREATE TABLE `equipos` (
  `id` varchar(100) NOT NULL,
  `rack_id` varchar(50) NOT NULL,
  `modelo` varchar(100) NOT NULL DEFAULT '',
  `numero_serie` varchar(100) NOT NULL DEFAULT '',
  `puerto_conexion` varchar(100) NOT NULL DEFAULT '',
  `servicio` varchar(100) NOT NULL DEFAULT '',
  `estado` varchar(20) NOT NULL DEFAULT 'Inactivo',
  `u_pos` int(11) NOT NULL DEFAULT 1,
  `u_size` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `racks`
--

CREATE TABLE `racks` (
  `id` varchar(50) NOT NULL,
  `site_id` char(1) NOT NULL COMMENT 'A–E',
  `nombre` varchar(100) NOT NULL DEFAULT '',
  `ubicacion` varchar(100) NOT NULL DEFAULT '',
  `unidades` int(11) NOT NULL DEFAULT 42
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `conexiones`
--
ALTER TABLE `conexiones`
  ADD PRIMARY KEY (`id`,`equipo_id`),
  ADD KEY `idx_conex_equipo` (`equipo_id`);

--
-- Indices de la tabla `equipos`
--
ALTER TABLE `equipos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_equipos_rack` (`rack_id`);

--
-- Indices de la tabla `racks`
--
ALTER TABLE `racks`
  ADD PRIMARY KEY (`id`);

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `conexiones`
--
ALTER TABLE `conexiones`
  ADD CONSTRAINT `fk_conexion_equipo` FOREIGN KEY (`equipo_id`) REFERENCES `equipos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `equipos`
--
ALTER TABLE `equipos`
  ADD CONSTRAINT `fk_equipo_rack` FOREIGN KEY (`rack_id`) REFERENCES `racks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
