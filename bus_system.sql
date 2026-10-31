/*
 Navicat Premium Data Transfer

 Source Server         : Keshe
 Source Server Type    : MySQL
 Source Server Version : 80300 (8.3.0)
 Source Host           : localhost:3306
 Source Schema         : bus_system

 Target Server Type    : MySQL
 Target Server Version : 80300 (8.3.0)
 File Encoding         : 65001

 Date: 31/10/2026 17:10:12
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for arrival_records
-- ----------------------------
DROP TABLE IF EXISTS `arrival_records`;
CREATE TABLE `arrival_records`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `bus_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `station_id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `arrival_time` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_bus`(`bus_id` ASC) USING BTREE,
  INDEX `idx_time`(`arrival_time` ASC) USING BTREE,
  INDEX `idx_arrival_records_bus_time`(`bus_id` ASC, `arrival_time` DESC) USING BTREE,
  INDEX `idx_arrival_bus`(`bus_id` ASC, `arrival_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 19 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of arrival_records
-- ----------------------------

-- ----------------------------
-- Table structure for bus_status
-- ----------------------------
DROP TABLE IF EXISTS `bus_status`;
CREATE TABLE `bus_status`  (
  `bus_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `station_id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `arrival_time` datetime NOT NULL,
  `line` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT '1路',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `direction` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'forward',
  PRIMARY KEY (`bus_id`) USING BTREE,
  INDEX `idx_bus_status_bus_id`(`bus_id` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of bus_status
-- ----------------------------

-- ----------------------------
-- Table structure for segment_distance
-- ----------------------------
DROP TABLE IF EXISTS `segment_distance`;
CREATE TABLE `segment_distance`  (
  `from_station` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `to_station` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `distance_m` int NOT NULL,
  PRIMARY KEY (`from_station`, `to_station`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of segment_distance
-- ----------------------------
INSERT INTO `segment_distance` VALUES ('S001', 'S002', 200);
INSERT INTO `segment_distance` VALUES ('S002', 'S001', 200);
INSERT INTO `segment_distance` VALUES ('S002', 'S003', 300);
INSERT INTO `segment_distance` VALUES ('S003', 'S002', 300);

-- ----------------------------
-- Table structure for segment_history
-- ----------------------------
DROP TABLE IF EXISTS `segment_history`;
CREATE TABLE `segment_history`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `from_station` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `to_station` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `duration_ms` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_segment`(`from_station` ASC, `to_station` ASC) USING BTREE,
  INDEX `idx_segment_history_stations`(`from_station` ASC, `to_station` ASC) USING BTREE,
  INDEX `idx_seg_hist_dir`(`from_station` ASC, `to_station` ASC, `created_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 20 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of segment_history
-- ----------------------------

-- ----------------------------
-- Table structure for stations
-- ----------------------------
DROP TABLE IF EXISTS `stations`;
CREATE TABLE `stations`  (
  `id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `sort_index` int NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of stations
-- ----------------------------
INSERT INTO `stations` VALUES ('S001', '清华中学站', 0);
INSERT INTO `stations` VALUES ('S002', '重庆理工大学站', 1);
INSERT INTO `stations` VALUES ('S003', '红光站', 2);

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `password` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO `users` VALUES (1, 'admin', '123456', '2026-10-16 16:46:58');
INSERT INTO `users` VALUES (2, '陈虹润', '123456', '2026-10-31 17:00:32');

SET FOREIGN_KEY_CHECKS = 1;
