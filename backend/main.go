package main

import (
	"messenger-backend/router"
)

func main() {
	r := router.SetupRouter()
	r.Run(":8080")
}
