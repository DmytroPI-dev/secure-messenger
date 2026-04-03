package main

import (
	"log"
	"messenger-backend/router"
)

func main() {
	r, err := router.SetupRouter()
	if err != nil {
		log.Fatal(err)
	}

	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
