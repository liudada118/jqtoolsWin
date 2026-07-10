cmake_minimum_required(VERSION 3.20)

project(JqToolsCarAdaptiveNative LANGUAGES CXX)

add_library(JqToolsCarAdaptiveNative SHARED
  src/JqToolsCarAdaptiveNative.cpp
  src/JqToolsCarAdaptiveNative.def
  include/JqToolsCarAdaptiveNative.h
)

target_compile_features(JqToolsCarAdaptiveNative PRIVATE cxx_std_17)
target_include_directories(JqToolsCarAdaptiveNative PUBLIC include)
target_link_libraries(JqToolsCarAdaptiveNative PRIVATE winhttp shell32)

if(MSVC)
  target_compile_options(JqToolsCarAdaptiveNative PRIVATE /utf-8 /W4 /permissive-)
  target_compile_definitions(JqToolsCarAdaptiveNative PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
endif()

set(MOCK_SDK_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/../../mock-sdk")
set(WS_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/../../node_modules/ws")

add_custom_command(TARGET JqToolsCarAdaptiveNative POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:JqToolsCarAdaptiveNative>/mock-sdk"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${MOCK_SDK_SOURCE_DIR}/mock-service.js"
    "${MOCK_SDK_SOURCE_DIR}/mock-debug.html"
    "${MOCK_SDK_SOURCE_DIR}/package.json"
    "$<TARGET_FILE_DIR:JqToolsCarAdaptiveNative>/mock-sdk"
  COMMAND ${CMAKE_COMMAND} -E copy_directory
    "${WS_SOURCE_DIR}"
    "$<TARGET_FILE_DIR:JqToolsCarAdaptiveNative>/mock-sdk/node_modules/ws"
)
