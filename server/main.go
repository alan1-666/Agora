package main

import (
	"context"
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"agora/internal/config"
	"agora/internal/crypto"
	"agora/internal/db"
	"agora/internal/hub"
	"agora/internal/server"
	"agora/internal/store"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	database, err := db.New(ctx, cfg.DatabaseURL, cfg.EmbeddingDim)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer database.Pool.Close()
	log.Println("db connected + schema ready")

	st := store.New(database.Pool, crypto.New(cfg.AppSecret))
	srv := server.New(cfg, st, hub.New())

	r := gin.Default()
	corsCfg := cors.DefaultConfig()
	corsCfg.AllowOrigins = cfg.CORSOrigins
	corsCfg.AllowHeaders = []string{"*"}
	corsCfg.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	r.Use(cors.New(corsCfg))

	srv.Routes(r)

	log.Printf("listening on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
